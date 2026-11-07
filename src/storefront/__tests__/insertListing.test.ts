import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import * as ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildListingSource, insertInteractiveListing } from "../insertListing";
import type { ListingConfig, ListingProduct } from "../listingModel";

interface FakeExport {
	type: "component" | "function";
	isDefaultExport: boolean;
	insertURL: string;
}

interface FakeCodeFile {
	id: string;
	exports: FakeExport[];
	remove: () => Promise<void>;
	setContent: (source: string) => Promise<void>;
}

const { framer, methods } = vi.hoisted(function mocks() {
	const methods = {
		isAllowedTo: vi.fn<(method: string) => boolean>(),
		createCodeFile:
			vi.fn<(name: string, source: string) => Promise<FakeCodeFile>>(),
		getCodeFile: vi.fn<(id: string) => Promise<FakeCodeFile | null>>(),
		addComponentInstance:
			vi.fn<
				(options: {
					url: string;
					attributes: Record<string, string>;
				}) => Promise<void>
			>(),
		getCodeFiles: vi.fn(),
		removeNodes: vi.fn(),
	};
	return { framer: { ...methods }, methods };
});

// Mock the bridge's named export, not the SDK: no editor handshake is loaded.
vi.mock("../../lib/framer", function bridge() {
	return { framer };
});
vi.mock("@framer/plugin", function unexpectedSDK() {
	throw new Error(
		"Listing insertion tests must not load the actual Framer SDK",
	);
});

const products: ListingProduct[] = [
	{
		id: "public-product",
		name: 'Public "shoe" <limited>',
		description: "Cotton\nTrail shoe",
		price: 1250,
		regularPrice: 2500,
		rating: 4.5,
		ratingCount: 12,
		imageUrl: "https://store.example/shoe.jpg",
		permalink: "/products/shoe",
		fields: {
			"cms-category": ["Running"],
			"cms-price": 1250,
			"cms-rating": 4.5,
			"cms-discount": 50,
		},
	},
];
const config: ListingConfig = {
	title: "Trail collection",
	currency: "USD",
	pageSize: 7,

	searchFields: ["name", "cms-category"],
	filters: [
		{
			id: "cost",
			label: "Custom price",
			field: "cms-price",
			kind: "price",
			enabled: true,
		},
		{
			id: "score",
			label: "Custom rating",
			field: "cms-rating",
			kind: "rating",
			enabled: true,
		},
		{
			id: "saving",
			label: "Custom discount",
			field: "cms-discount",
			kind: "discount",
			enabled: false,
		},
	],
};
const columns = [
	{ id: "cms-category", name: 'Category "label"' },
	{ id: "cms-price", name: "Retail price" },
	{ id: "cms-rating", name: "Customer score" },
	{ id: "cms-discount", name: "Discount %" },
];

function componentExport(overrides: Partial<FakeExport> = {}): FakeExport {
	return {
		type: "component",
		isDefaultExport: true,
		insertURL: "https://framer.com/m/EcomLinkCatalog-new.js",
		...overrides,
	};
}

function codeFile(
	id = "new-file",
	exports: FakeExport[] = [componentExport()],
): FakeCodeFile {
	return {
		id,
		exports,
		remove: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
		setContent: vi
			.fn<(source: string) => Promise<void>>()
			.mockResolvedValue(undefined),
	};
}

function diagnosticMessages(diagnostics: readonly ts.Diagnostic[]): string[] {
	return diagnostics.map(function message(diagnostic) {
		const text = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
		if (!diagnostic.file || diagnostic.start === undefined)
			return `TS${diagnostic.code}: ${text}`;
		const position = diagnostic.file.getLineAndCharacterOfPosition(
			diagnostic.start,
		);
		return `${diagnostic.file.fileName}:${position.line + 1}:${position.character + 1} TS${diagnostic.code}: ${text}`;
	});
}

function transpile(source: string): ts.TranspileOutput {
	return ts.transpileModule(source, {
		fileName: "EcomLinkCatalog.tsx",
		reportDiagnostics: true,
		compilerOptions: {
			target: ts.ScriptTarget.ES2022,
			module: ts.ModuleKind.CommonJS,
			jsx: ts.JsxEmit.ReactJSX,
			strict: true,
		},
	});
}

interface PropertyControl {
	type: string;
	title?: string;
	defaultValue?: unknown;
	options?: string[];
	optionTitles?: string[];
	min?: number;
	max?: number;
	step?: number;
	control?: PropertyControl;
	controls?: Record<string, PropertyControl>;
}

type CatalogComponent = (
	props: Partial<ListingConfig> & { style?: React.CSSProperties },
) => React.ReactElement<{
	products: ListingProduct[];
	config: ListingConfig;
	style?: React.CSSProperties;
}>;

function evaluateCatalog(source: string) {
	const addPropertyControls =
		vi.fn<
			(
				component: CatalogComponent,
				controls: Record<string, PropertyControl>,
			) => void
		>();
	const exports: { default?: CatalogComponent } = {};
	function requireModule(name: string): unknown {
		if (name === "react") return React;
		if (name === "react/jsx-runtime") return jsxRuntime;
		if (name === "framer")
			return {
				addPropertyControls,
				ControlType: {
					String: "string",
					Number: "number",
					Boolean: "boolean",
					Array: "array",
					Object: "object",
					Enum: "enum",
				},
			};
		throw new Error(`Unexpected generated-source dependency: ${name}`);
	}
	const compiled = transpile(source);
	expect(diagnosticMessages(compiled.diagnostics ?? [])).toEqual([]);
	// Only execute our own generated source with the explicitly allowed modules.
	new Function("require", "exports", compiled.outputText)(
		requireModule,
		exports,
	);
	expect(exports.default).toBeTypeOf("function");
	expect(addPropertyControls).toHaveBeenCalledTimes(1);
	return {
		component: exports.default!,
		registration: addPropertyControls.mock.calls[0],
	};
}

function semanticDiagnostics(source: string): readonly ts.Diagnostic[] {
	const directory = ts.sys.getCurrentDirectory().replace(/\\/g, "/");
	const sourcePath = `${directory}/EcomLinkCatalog.generated.tsx`;
	const declarationPath = `${directory}/framer.generated.d.ts`;
	// Model only the public runtime API used by generated components. React and
	// its JSX types resolve from the real installed dependency, not permissive stubs.
	const declaration = `declare module "framer" {
    export enum ControlType { String = "string", Number = "number", Boolean = "boolean", Array = "array", Object = "object", Enum = "enum" }
    interface BaseControl { title?: string; description?: string; defaultValue?: unknown }
    type PropertyControl = BaseControl & (
      { type: ControlType.String | "string" } |
      { type: ControlType.Number | "number"; min?: number; max?: number; step?: number } |
      { type: ControlType.Boolean | "boolean" } |
      { type: ControlType.Enum | "enum"; options: string[]; optionTitles?: string[] } |
      { type: ControlType.Array | "array"; control: PropertyControl } |
      { type: ControlType.Object | "object"; controls: Record<string, PropertyControl> }
    )
    export function addPropertyControls<P>(component: import("react").ComponentType<P>, controls: Record<string, PropertyControl>): void
  }`;
	const virtualFiles = new Map([
		[sourcePath, source],
		[declarationPath, declaration],
	]);
	const options: ts.CompilerOptions = {
		target: ts.ScriptTarget.ES2022,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		jsx: ts.JsxEmit.ReactJSX,
		strict: true,
		noEmit: true,
		skipLibCheck: true,
		types: ["react"],
		lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
	};
	const host = ts.createCompilerHost(options);
	const originalReadFile = host.readFile.bind(host);
	const originalFileExists = host.fileExists.bind(host);
	const originalGetSourceFile = host.getSourceFile.bind(host);
	host.readFile = function readFile(path) {
		return virtualFiles.get(path.replace(/\\/g, "/")) ?? originalReadFile(path);
	};
	host.fileExists = function fileExists(path) {
		return (
			virtualFiles.has(path.replace(/\\/g, "/")) || originalFileExists(path)
		);
	};
	host.getSourceFile = function getSourceFile(
		path,
		languageVersion,
		onError,
		shouldCreateNewSourceFile,
	) {
		const contents = virtualFiles.get(path.replace(/\\/g, "/"));
		return contents === undefined
			? originalGetSourceFile(
					path,
					languageVersion,
					onError,
					shouldCreateNewSourceFile,
				)
			: ts.createSourceFile(path, contents, languageVersion, true);
	};
	const program = ts.createProgram(
		[sourcePath, declarationPath],
		options,
		host,
	);
	return ts.getPreEmitDiagnostics(program);
}

beforeEach(function resetBridge() {
	vi.resetAllMocks();
	Object.assign(framer, methods);
	methods.isAllowedTo.mockReturnValue(true);
	methods.createCodeFile.mockResolvedValue(codeFile());
	methods.getCodeFile.mockResolvedValue(null);
	methods.addComponentInstance.mockResolvedValue(undefined);
});

afterEach(function restoreTimers() {
	vi.useRealTimers();
});

describe("buildListingSource", function () {
	it("generates a standalone TSX module with only Framer and React imports", function () {
		const source = buildListingSource(products, config, columns);
		const parsed = ts.createSourceFile(
			"EcomLinkCatalog.tsx",
			source,
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TSX,
		);
		const imports = parsed.statements
			.filter(ts.isImportDeclaration)
			.map(function moduleName(statement) {
				return (statement.moduleSpecifier as ts.StringLiteral).text;
			});
		expect(imports.sort()).toEqual(["framer", "react"]);
		expect(source).not.toMatch(/(?:from\s*|import\s*)["']\.{1,2}\//);
		expect(source).not.toContain("?raw");
		expect(source).toContain("function filterProducts");
		expect(source).toContain("const SHOPORA_STYLES");
		expect(source).toContain("function ShoporaListing");
		expect(source).toContain("export default function EcomLinkCatalog");
		expect(source).toContain("@framerSupportedLayoutWidth any-prefer-fixed");
		expect(source).toContain("@framerSupportedLayoutHeight auto");
		expect(diagnosticMessages(transpile(source).diagnostics ?? [])).toEqual([]);
	});

	it("embeds public products and config losslessly and permits Framer prop overrides", function () {
		const before = structuredClone({ products, config, columns });
		const { component } = evaluateCatalog(
			buildListingSource(products, config, columns),
		);
		const result = component({});
		expect(result.props.products).toEqual(products);
		expect(result.props.config).toEqual(config);
		const style: React.CSSProperties = { width: "100%" };
		const override = component({
			title: "Canvas title",
			pageSize: 3,
			currency: "EUR",
			style,
		});
		expect(override.props.config).toMatchObject({
			...config,
			title: "Canvas title",
			pageSize: 3,
			currency: "EUR",
		});
		expect(override.props.style).toMatchObject(style);
		expect(component({}).props.config).toEqual(config);
		expect({ products, config, columns }).toEqual(before);
		expect(buildListingSource([], config, [])).not.toContain("public-product");
	});

	it("provides an intrinsic width fallback without overriding explicit Framer sizing", function () {
		const { component } = evaluateCatalog(
			buildListingSource(products, config, columns),
		);
		expect(component({}).props.style).toEqual({
			minWidth: 0,
			flexShrink: 0,
			width: 1280,
		});
		for (const width of [undefined, "auto", "100%", 350] as const) {
			const style: React.CSSProperties = {
				width,
				height: "auto",
				opacity: 0.8,
				position: "relative",
			};
			const before = { ...style };
			expect(component({ style }).props.style).toEqual({
				...style,
				minWidth: 0,
				flexShrink: 0,
				width: width === undefined || width === "auto" ? 1280 : width,
			});
			expect(style).toEqual(before);
		}
		const style: React.CSSProperties = {
			width: 350,
			minWidth: 200,
			flexShrink: 1,
		};
		expect(component({ style }).props.style).toEqual(style);
	});

	it("registers Framer controls, configured defaults and dynamic CMS column enums", function () {
		const {
			component,
			registration: [registeredComponent, controls],
		} = evaluateCatalog(buildListingSource(products, config, columns));
		expect(registeredComponent).toBe(component);
		for (const key of ["title", "currency"] as const) {
			expect(controls[key]).toMatchObject({
				type: "string",
				defaultValue: config[key],
			});
		}
		expect(controls.title.title).toBe("Catalog label");
		for (const key of ["brand", "showHeader", "showFooter"]) {
			expect(controls).not.toHaveProperty(key);
		}
		expect(controls.pageSize).toMatchObject({
			type: "number",
			min: 1,
			max: 100,
			step: 1,
			defaultValue: 7,
		});
		expect(controls.searchFields).toMatchObject({
			type: "array",
			defaultValue: config.searchFields,
		});
		const expectedFields = [
			"name",
			"description",
			"price",
			"regularPrice",
			"rating",
			"category",
			"brand",
			"color",
			"discount",
			...columns.map(function id(column) {
				return column.id;
			}),
		];
		const expectedLabels = [
			"Product name",
			"Description",
			"Price",
			"Regular price",
			"Rating",
			"Category",
			"Brand",
			"Color",
			"Calculated discount",
			...columns.map(function label(column) {
				return `CMS: ${column.name}`;
			}),
		];
		expect(controls.searchFields.control).toMatchObject({
			type: "enum",
			options: expectedFields,
			optionTitles: expectedLabels,
		});
		expect(controls.filters).toMatchObject({
			type: "array",
			defaultValue: config.filters,
		});
		expect(controls.filters.control?.type).toBe("object");
		expect(controls.filters.control?.controls).toMatchObject({
			id: { type: "string" },
			label: { type: "string" },
			enabled: { type: "boolean", defaultValue: true },
			field: {
				type: "enum",
				options: expectedFields,
				optionTitles: expectedLabels,
			},
			kind: {
				type: "enum",
				options: ["options", "rating", "price", "color", "discount"],
			},
		});
	});

	it("has no semantic diagnostics with real React types and a virtual Framer declaration", function () {
		expect(
			diagnosticMessages(
				semanticDiagnostics(buildListingSource(products, config, columns)),
			),
		).toEqual([]);
	}, 15000);
});

describe("insertInteractiveListing", function () {
	it("creates a fresh code file and inserts only its default component export", async function () {
		const file = codeFile("fresh-file", [
			componentExport({
				type: "function",
				isDefaultExport: true,
				insertURL: "wrong-function",
			}),
			componentExport({
				isDefaultExport: false,
				insertURL: "wrong-named-component",
			}),
			componentExport(),
		]);
		methods.createCodeFile.mockResolvedValue(file);
		await insertInteractiveListing(products, config, columns);
		expect(methods.isAllowedTo).toHaveBeenCalledWith("createCodeFile");
		expect(methods.isAllowedTo).toHaveBeenCalledWith("addComponentInstance");
		expect(methods.createCodeFile).toHaveBeenCalledExactlyOnceWith(
			"EcomLinkCatalog",
			buildListingSource(products, config, columns),
		);
		expect(methods.addComponentInstance).toHaveBeenCalledExactlyOnceWith({
			url: componentExport().insertURL,
			attributes: {
				name: "Shopora Catalog",
				width: "1280px",
				height: "fit-content",
			},
		});
		expect(methods.getCodeFile).not.toHaveBeenCalled();
		expect(file.remove).not.toHaveBeenCalled();
	});

	it.each(["createCodeFile", "addComponentInstance"] as const)(
		"performs no writes when %s permission is denied",
		async function (denied) {
			methods.isAllowedTo.mockImplementation(function allowed(method) {
				return method !== denied;
			});
			await expect(
				insertInteractiveListing(products, config, columns),
			).rejects.toThrow(/code and canvas edit access.*editor account/i);
			expect(methods.createCodeFile).not.toHaveBeenCalled();
			expect(methods.addComponentInstance).not.toHaveBeenCalled();
			expect(methods.getCodeFile).not.toHaveBeenCalled();
			expect(methods.removeNodes).not.toHaveBeenCalled();
		},
	);

	it.each(["createCodeFile", "addComponentInstance"] as const)(
		"reports an unavailable %s API before writing",
		async function (missing) {
			Reflect.deleteProperty(framer, missing);
			await expect(
				insertInteractiveListing(products, config, columns),
			).rejects.toThrow(/update Framer/i);
			expect(methods.createCodeFile).not.toHaveBeenCalled();
			expect(methods.addComponentInstance).not.toHaveBeenCalled();
		},
	);

	it("waits for compilation and refreshes only the newly created file with fake timers", async function () {
		vi.useFakeTimers();
		const pending = codeFile("pending-file", []);
		const compiled = codeFile("pending-file");
		methods.createCodeFile.mockResolvedValue(pending);
		methods.getCodeFile
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce(compiled);
		const insertion = insertInteractiveListing(products, config, columns);
		await vi.advanceTimersByTimeAsync(499);
		expect(methods.getCodeFile).not.toHaveBeenCalled();
		expect(methods.addComponentInstance).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(methods.getCodeFile).toHaveBeenCalledExactlyOnceWith("pending-file");
		expect(methods.addComponentInstance).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(500);
		await insertion;
		expect(methods.getCodeFile).toHaveBeenCalledTimes(2);
		expect(methods.addComponentInstance).toHaveBeenCalledTimes(1);
		expect(pending.remove).not.toHaveBeenCalled();
		expect(compiled.remove).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("accepts a default component that becomes available on the final compilation refresh", async function () {
		vi.useFakeTimers();
		const pending = codeFile("last-refresh", []);
		const compiled = codeFile("last-refresh");
		methods.createCodeFile.mockResolvedValue(pending);
		methods.getCodeFile.mockResolvedValue(pending);
		for (let attempt = 0; attempt < 9; attempt++)
			methods.getCodeFile.mockResolvedValueOnce(pending);
		methods.getCodeFile.mockResolvedValueOnce(compiled);
		// Capture rejection immediately so a failing regression never creates an
		// unhandled rejection while the fake clock advances through the poll loop.
		const result = insertInteractiveListing(products, config, columns).catch(
			function failure(error: unknown) {
				return error;
			},
		);
		await vi.runAllTimersAsync();
		expect(await result).toBeUndefined();
		expect(methods.getCodeFile).toHaveBeenCalledTimes(10);
		expect(methods.addComponentInstance).toHaveBeenCalledTimes(1);
		expect(pending.remove).not.toHaveBeenCalled();
	});

	it("times out missing default exports and removes only the new file", async function () {
		vi.useFakeTimers();
		const file = codeFile("uncompiled-file", [
			componentExport({ isDefaultExport: false }),
		]);
		methods.createCodeFile.mockResolvedValue(file);
		methods.getCodeFile.mockResolvedValue(file);
		const assertion = expect(
			insertInteractiveListing(products, config, columns),
		).rejects.toThrow(/could not compile.*try again/i);
		await vi.runAllTimersAsync();
		await assertion;
		expect(methods.getCodeFile).toHaveBeenCalledTimes(10);
		expect(
			methods.getCodeFile.mock.calls.every(function fresh([id]) {
				return id === "uncompiled-file";
			}),
		).toBe(true);
		expect(methods.addComponentInstance).not.toHaveBeenCalled();
		expect(file.remove).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("cleans up a failed canvas insert without masking the original error", async function () {
		const file = codeFile();
		const error = new Error("Canvas insertion failed");
		methods.createCodeFile.mockResolvedValue(file);
		methods.addComponentInstance.mockRejectedValue(error);
		vi.mocked(file.remove).mockRejectedValue(new Error("Cleanup also failed"));
		await expect(
			insertInteractiveListing(products, config, columns),
		).rejects.toBe(error);
		expect(file.remove).toHaveBeenCalledTimes(1);
	});

	it("cleans up when fetching the compiled file fails", async function () {
		vi.useFakeTimers();
		const file = codeFile("refresh-failed", []);
		const error = new Error("Compilation status unavailable");
		methods.createCodeFile.mockResolvedValue(file);
		methods.getCodeFile.mockRejectedValue(error);
		const assertion = expect(
			insertInteractiveListing(products, config, columns),
		).rejects.toBe(error);
		await vi.runAllTimersAsync();
		await assertion;
		expect(file.remove).toHaveBeenCalledTimes(1);
		expect(methods.addComponentInstance).not.toHaveBeenCalled();
	});

	it("does not attempt cleanup without CodeFile.remove permission", async function () {
		const file = codeFile();
		const error = new Error("Canvas denied");
		methods.createCodeFile.mockResolvedValue(file);
		methods.isAllowedTo.mockImplementation(function allowed(method) {
			return method !== "CodeFile.remove";
		});
		methods.addComponentInstance.mockRejectedValue(error);
		await expect(
			insertInteractiveListing(products, config, columns),
		).rejects.toBe(error);
		expect(file.remove).not.toHaveBeenCalled();
	});

	it("propagates file creation failures without attempting canvas writes or unrelated cleanup", async function () {
		const error = new Error("Cannot create code");
		methods.createCodeFile.mockRejectedValue(error);
		await expect(
			insertInteractiveListing(products, config, columns),
		).rejects.toBe(error);
		expect(methods.addComponentInstance).not.toHaveBeenCalled();
		expect(methods.getCodeFile).not.toHaveBeenCalled();
		expect(methods.removeNodes).not.toHaveBeenCalled();
	});

	it("never overwrites earlier code or removes an earlier successful insertion", async function () {
		const previous = codeFile("merchant-file", [
			componentExport({ insertURL: "https://framer.com/m/MerchantEdited.js" }),
		]);
		const fresh = codeFile("fresh-file");
		methods.createCodeFile
			.mockResolvedValueOnce(previous)
			.mockResolvedValueOnce(fresh);
		methods.getCodeFiles.mockResolvedValue([previous]);
		const firstConfig = structuredClone(config);
		await insertInteractiveListing(products, firstConfig, columns);
		const previousSource = methods.createCodeFile.mock.calls[0][1];
		const error = new Error("Second insertion failed");
		methods.addComponentInstance.mockRejectedValueOnce(error);
		await expect(
			insertInteractiveListing(
				products,
				{ ...config, title: "New catalog" },
				columns,
			),
		).rejects.toBe(error);
		expect(methods.createCodeFile).toHaveBeenCalledTimes(2);
		expect(methods.createCodeFile.mock.calls[0][1]).toBe(previousSource);
		expect(methods.createCodeFile.mock.calls[1][1]).not.toBe(previousSource);
		expect(methods.getCodeFiles).not.toHaveBeenCalled();
		expect(previous.setContent).not.toHaveBeenCalled();
		expect(fresh.setContent).not.toHaveBeenCalled();
		expect(methods.removeNodes).not.toHaveBeenCalled();
		expect(previous.remove).not.toHaveBeenCalled();
		expect(fresh.remove).toHaveBeenCalledTimes(1);
		expect(firstConfig).toEqual(config);
	});
});
