import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@framer/plugin", function sdkMock() {
	return { framer: { getCollections: vi.fn() } };
});
vi.mock("../../storage/connections", function connectionsMock() {
	return { getActiveConnection: vi.fn() };
});
vi.mock("../../storage/settings", function settingsMock() {
	return { getSyncSettings: vi.fn() };
});

import { getActiveConnection } from "../../storage/connections";
import type { ConnectionRecord } from "../../storage/connections";
import { INTERNAL_COLLECTION_NAME, sdk } from "../../storage/internal";
import type {
	SdkCollectionLike,
	SdkFieldLike,
	SdkItemLike,
} from "../../storage/internal";
import { getSyncSettings } from "../../storage/settings";
import type { SyncFieldMapping, SyncSettings } from "../../storage/settings";
import { demoListingProducts, productValue } from "../listingModel";
import { loadListingCatalog, loadListingCollections } from "../listingCatalog";

type TestField = SdkFieldLike & {
	collectionId?: string;
	privateMetadata?: unknown;
};

function collection(
	id: string,
	name: string,
	fields: TestField[] = [],
	items: SdkItemLike[] = [],
): SdkCollectionLike {
	return {
		id,
		name,
		getFields: vi.fn().mockResolvedValue(fields),
		getItems: vi.fn().mockResolvedValue(items),
		addFields: vi.fn(),
		addItems: vi.fn(),
		removeItems: vi.fn(),
	};
}

function item(id: string, values: Record<string, unknown>): SdkItemLike {
	return {
		id,
		slug: `slug-${id}`,
		fieldData: Object.fromEntries(
			Object.entries(values).map(function entry([key, value]) {
				return [key, { value }];
			}),
		),
	};
}

function field(id: string, name: string, type: string = "string"): TestField {
	return { id, name, type };
}

function row(
	platformField: SyncFieldMapping["platformField"],
	cmsFieldId: string,
	enabled: boolean = true,
): SyncFieldMapping {
	return { platformField, cmsFieldId, enabled, direction: "platform-to-cms" };
}

function settings(
	targetCollectionId: string,
	mapping: SyncFieldMapping[] = [],
): SyncSettings {
	return {
		targetCollectionId,
		mapping,
		defaultItemStatus: "publish",
		statusesFilter: ["publish"],
		safetyCap: 500,
		variationsCap: 30,
		galleryCap: 10,
	};
}

function connect(saved: SyncSettings): void {
	const connection: ConnectionRecord = {
		id: "private-connection",
		providerId: "woocommerce",
		storeUrl: "https://private-shop.example",
		storeHost: "private-shop.example",
		consumerKeyMasked: "ck_private",
		consumerSecretMasked: "cs_private",
		keyScope: "read_write",
		companionPluginUrl: null,
		validationState: "valid",
		lastValidatedAt: null,
		isActive: true,
	};
	vi.mocked(getActiveConnection).mockResolvedValue(connection);
	vi.mocked(getSyncSettings).mockResolvedValue(saved);
}

beforeEach(function resetSdk() {
	vi.resetAllMocks();
	vi.mocked(sdk.getCollections).mockResolvedValue([]);
	vi.mocked(getActiveConnection).mockResolvedValue(null);
	vi.mocked(getSyncSettings).mockResolvedValue(null);
});

describe("collection selection and failures", function selectionTests() {
	it("lists only public collection id/name pairs, never SDK methods or internal storage", async function publicChoices() {
		const internal = collection("internal", INTERNAL_COLLECTION_NAME);
		const products = collection("products", "Products");
		vi.mocked(sdk.getCollections).mockResolvedValue([internal, products]);
		expect(await loadListingCollections()).toEqual([
			{ id: "products", name: "Products" },
		]);
		expect(internal.getFields).not.toHaveBeenCalled();
		expect(internal.getItems).not.toHaveBeenCalled();
		expect(getActiveConnection).not.toHaveBeenCalled();
	});

	it("provides explicit demo products and default semantic fields when no target is available", async function demos() {
		const result = await loadListingCatalog();
		expect(result).toMatchObject({
			products: demoListingProducts(),
			collectionId: null,
			collectionName: null,
			placeholder: true,
		});
		expect(result.fields).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: "name" }),
				expect.objectContaining({ id: "category" }),
				expect.objectContaining({ id: "brand" }),
				expect.objectContaining({ id: "color" }),
			]),
		);
	});

	it("does not arbitrarily select a public collection without an active saved target", async function noArbitraryTarget() {
		vi.mocked(sdk.getCollections).mockResolvedValue([
			collection("other", "Other"),
		]);
		expect((await loadListingCatalog()).placeholder).toBe(true);
		connect(settings("deleted"));
		expect((await loadListingCatalog()).placeholder).toBe(true);
	});

	it("resolves the active connection and saved target, preserving a real empty collection", async function savedTarget() {
		const selected = collection("saved", "Synced products");
		vi.mocked(sdk.getCollections).mockResolvedValue([
			collection("first", "First"),
			selected,
		]);
		connect(settings("saved"));
		expect(await loadListingCatalog()).toEqual({
			products: [],
			fields: [],
			collectionId: "saved",
			collectionName: "Synced products",
			placeholder: false,
		});
		expect(getSyncSettings).toHaveBeenCalledWith("private-connection");
	});

	it("honors an explicit collection over the active saved target, including an empty selection", async function explicitTarget() {
		connect(settings("saved"));
		vi.mocked(sdk.getCollections).mockResolvedValue([
			collection("saved", "Saved"),
			collection("manual", "Manual"),
		]);
		expect(await loadListingCatalog("manual")).toMatchObject({
			products: [],
			collectionId: "manual",
			placeholder: false,
		});
	});

	it("rejects a missing explicit collection, including an empty ID, rather than substituting demos", async function missingExplicit() {
		await expect(loadListingCatalog("deleted")).rejects.toThrow(
			/unavailable.*Select an existing public CMS collection/,
		);
		await expect(loadListingCatalog("")).rejects.toThrow(/unavailable/);
	});

	it("always rejects the explicit internal ID before reading connection settings or internal items", async function rejectInternal() {
		const internal = collection("internal", INTERNAL_COLLECTION_NAME);
		vi.mocked(sdk.getCollections).mockResolvedValue([internal]);
		vi.mocked(getActiveConnection).mockRejectedValue(
			new Error("Private storage unavailable"),
		);
		await expect(loadListingCatalog("internal")).rejects.toThrow(
			/private plugin storage.*public product collection/,
		);
		expect(getActiveConnection).not.toHaveBeenCalled();
		expect(internal.getFields).not.toHaveBeenCalled();
		expect(internal.getItems).not.toHaveBeenCalled();
	});

	it("never uses an internal saved target as products", async function internalSavedTarget() {
		const internal = collection("internal", INTERNAL_COLLECTION_NAME);
		vi.mocked(sdk.getCollections).mockResolvedValue([internal]);
		connect(settings("internal"));
		expect((await loadListingCatalog()).placeholder).toBe(true);
		expect(internal.getItems).not.toHaveBeenCalled();
	});

	it("reports actionable explicit CMS read errors without demo fallback", async function readErrors() {
		const products = collection("products", "Products");
		vi.mocked(sdk.getCollections).mockResolvedValue([products]);
		vi.mocked(products.getItems).mockRejectedValue(
			new Error("Permission denied"),
		);
		await expect(loadListingCatalog("products")).rejects.toThrow(
			/Products.*Check CMS access.*Permission denied/,
		);
		vi.mocked(products.getItems).mockResolvedValue([]);
		vi.mocked(products.getFields).mockRejectedValue(
			new Error("Schema unavailable"),
		);
		await expect(loadListingCatalog("products")).rejects.toThrow(
			/Schema unavailable/,
		);
	});

	it("reports collection enumeration errors", async function enumerationErrors() {
		vi.mocked(sdk.getCollections).mockRejectedValue(new Error("CMS offline"));
		await expect(loadListingCollections()).rejects.toThrow(
			/list CMS collections.*CMS offline/,
		);
		await expect(loadListingCatalog("products")).rejects.toThrow(/CMS offline/);
	});

	it("can load an explicitly selected public catalog even if private settings cannot be read", async function independentPublicRead() {
		vi.mocked(getActiveConnection).mockRejectedValue(
			new Error("Private storage unavailable"),
		);
		vi.mocked(sdk.getCollections).mockResolvedValue([
			collection(
				"products",
				"Products",
				[field("n", "Title")],
				[item("1", { n: "Public shoe" })],
			),
		]);
		expect((await loadListingCatalog("products")).products[0].name).toBe(
			"Public shoe",
		);
		await expect(loadListingCatalog()).rejects.toThrow(
			/active catalog settings.*Private storage unavailable/,
		);
	});
});

describe("public product mapping", function mappingTests() {
	it("uses enabled saved mappings by CMS ID, including JSON categories and Woo attributes", async function savedMappings() {
		const fields = [
			field("n", "Custom heading"),
			field("p", "Custom amount"),
			field("r", "Original amount"),
			field("d", "Long text", "formattedText"),
			field("im", "Photo", "image"),
			field("u", "Shop link", "link"),
			field("stars", "Stars", "number"),
			field("reviews", "Reviews", "number"),
			field("cats", "Taxonomy"),
			field("attrs", "Options JSON"),
			field("decoy", "Title"),
		];
		const products = collection("products", "Products", fields, [
			item("shoe", {
				n: "Mapped shoe",
				decoy: "Wrong inferred title",
				p: "₹1,299.50",
				r: "$1,899.00",
				stars: 4.5,
				reviews: "121",
				d: "<p>Soft &amp; <b>comfortable</b></p>",
				im: { url: "https://cdn.example.com/shoe.jpg", id: "asset-private" },
				u: "https://shop.example.com/shoe",
				cats: JSON.stringify([
					{ id: 2, name: "Sneakers", slug: "sneakers" },
					{ name: "Men" },
				]),
				attrs: JSON.stringify([
					{ id: 1, name: "Color", options: ["Blue", "White"] },
					{ name: "Brand", options: ["Acme"] },
				]),
			}),
		]);
		connect(
			settings("products", [
				row("name", "n"),
				row("price", "p"),
				row("regularPrice", "r"),
				row("description", "d"),
				row("featuredImage", "im"),
				row("permalink", "u"),
				row("rating", "stars"),
				row("ratingCount", "reviews"),
				row("categories", "cats"),
				row("attributes", "attrs"),
			]),
		);
		vi.mocked(sdk.getCollections).mockResolvedValue([products]);
		const result = await loadListingCatalog();
		expect(result.products[0]).toMatchObject({
			id: "shoe",
			name: "Mapped shoe",
			price: 1299.5,
			regularPrice: 1899,
			rating: 4.5,
			ratingCount: 121,
			description: "Soft & comfortable",
			imageUrl: "https://cdn.example.com/shoe.jpg",
			permalink: "https://shop.example.com/shoe",
			fields: {
				cats: ["Sneakers", "Men"],
				category: ["Sneakers", "Men"],
				color: ["Blue", "White"],
				brand: ["Acme"],
			},
		});
		const serialized = JSON.stringify(result);
		expect(serialized).not.toContain("private-connection");
		expect(serialized).not.toContain("ck_private");
		expect(serialized).not.toContain("cs_private");
		expect(serialized).not.toContain("asset-private");
	});

	it("infers common CMS names, comma lists, booleans and finite numeric columns on another target", async function inferredMappings() {
		connect(settings("different", [row("name", "p"), row("price", "n")]));
		const fields = [
			field("n", "Product Name"),
			field("p", "Price"),
			field("rp", "regular_price"),
			field("d", "Short Description"),
			field("i", "Image", "image"),
			field("u", "URL", "link"),
			field("cat", "Categories"),
			field("br", "Vendor"),
			field("co", "Colour"),
			field("stock", "Stock quantity", "number"),
			field("sale", "On sale", "boolean"),
			field("labels", "Custom labels", "array"),
			field("weight", "Weight"),
			field("flag", "Flag"),
		];
		vi.mocked(sdk.getCollections).mockResolvedValue([
			collection("manual", "Manual", fields, [
				item("1", {
					n: "Inferred shoe",
					p: "$1,234.56",
					rp: 1500,
					d: "<div>A &nbsp;shoe</div>",
					i: "/images/shoe.jpg",
					u: "/products/shoe",
					cat: "Shoes, Running, Shoes",
					br: "Acme",
					co: "Blue, White",
					stock: "12",
					sale: "false",
					labels: ["New", "Featured"],
					weight: 1.25,
					flag: true,
				}),
			]),
		]);
		const result = await loadListingCatalog("manual");
		expect(result.products[0]).toMatchObject({
			name: "Inferred shoe",
			price: 1234.56,
			regularPrice: 1500,
			description: "A shoe",
			imageUrl: "/images/shoe.jpg",
			permalink: "/products/shoe",
			fields: {
				category: ["Shoes", "Running"],
				brand: ["Acme"],
				color: ["Blue", "White"],
				stock: 12,
				sale: false,
				labels: ["New", "Featured"],
				weight: 1.25,
				flag: true,
			},
		});
		expect(productValue(result.products[0], "stock")).toBe(12);
	});

	it("keeps disabled and unmapped columns out of saved semantic mappings", async function disabledMapping() {
		connect(
			settings("products", [row("name", "custom"), row("price", "p", false)]),
		);
		vi.mocked(sdk.getCollections).mockResolvedValue([
			collection(
				"products",
				"Products",
				[
					field("custom", "Heading"),
					field("p", "Price"),
					field("r", "Regular Price"),
				],
				[item("1", { custom: "Shoe", p: 99, r: 129 })],
			),
		]);
		const result = await loadListingCatalog();
		expect(result.products[0]).toMatchObject({
			name: "Shoe",
			price: null,
			regularPrice: null,
			fields: { p: 99, r: 129 },
		});
	});

	it("prefers a saved full description, but permits an enabled short description when the full one is disabled", async function descriptions() {
		const fields = [
			field("n", "Name"),
			field("long", "Description"),
			field("short", "Short Description"),
		];
		vi.mocked(sdk.getCollections).mockResolvedValue([
			collection("products", "Products", fields, [
				item("1", {
					n: "Shoe",
					long: "<p>Long description</p>",
					short: "<b>Short description</b>",
				}),
			]),
		]);
		connect(
			settings("products", [
				row("shortDescription", "short"),
				row("description", "long"),
			]),
		);
		expect((await loadListingCatalog()).products[0].description).toBe(
			"Long description",
		);
		connect(
			settings("products", [
				row("shortDescription", "short"),
				row("description", "long", false),
			]),
		);
		expect((await loadListingCatalog()).products[0].description).toBe(
			"Short description",
		);
	});

	it("retains absent and invalid numbers as null, and preserves genuine zero and false", async function absentValues() {
		const fields = [
			field("n", "Name"),
			field("p", "Price"),
			field("r", "Regular Price"),
			field("rating", "Rating", "number"),
			field("count", "Rating Count", "number"),
			field("b", "Available", "boolean"),
			field("num", "Inventory", "number"),
		];
		vi.mocked(sdk.getCollections).mockResolvedValue([
			collection("products", "Products", fields, [
				item("missing", {}),
				item("invalid", {
					p: "",
					r: "N/A",
					rating: Infinity,
					count: NaN,
					num: "not a number",
				}),
				item("zero", { p: 0, r: "0", rating: 0, count: "0", b: false, num: 0 }),
			]),
		]);
		const { products } = await loadListingCatalog("products");
		expect(products).toHaveLength(3);
		expect(products[0]).toMatchObject({
			name: "Untitled product",
			price: null,
			regularPrice: null,
			rating: null,
			ratingCount: null,
			fields: { p: null, b: null },
		});
		expect(products[1]).toMatchObject({
			price: null,
			regularPrice: null,
			rating: null,
			ratingCount: null,
			fields: { num: null },
		});
		expect(products[2]).toMatchObject({
			price: 0,
			regularPrice: 0,
			rating: 0,
			ratingCount: 0,
			fields: { b: false, num: 0 },
		});
		expect(JSON.parse(JSON.stringify(products))).toEqual(products);
	});

	it("rejects unsafe links and keeps unknown schema columns as safe values, not raw objects or credentials", async function safeSnapshot() {
		const schema: TestField[] = [
			field("n", "Name"),
			field("p", "Price"),
			field("url", "Permalink"),
			field("im", "Featured Image", "image"),
			field("custom", "Material"),
			field("obj", "Opaque object"),
			field("nan", "Unknown number"),
			field("secret1", "Consumer Key"),
			field("secret2", "Consumer Secret"),
			field("token", "Access token"),
			field("payload", "Payload"),
			{
				...field("meta", "Public label"),
				privateMetadata: { password: "metadata-secret" },
			},
			field("__proto__", "Unusual ID"),
		];
		vi.mocked(sdk.getCollections).mockResolvedValue([
			collection("products", "Products", schema, [
				item("1", {
					n: "Safe shoe",
					p: 12,
					url: "javascript:alert(1)",
					im: { url: "data:image/svg+xml,unsafe" },
					custom: "Cotton, Linen",
					obj: { consumerSecret: "object-secret" },
					nan: Infinity,
					secret1: "ck_live",
					secret2: "cs_live",
					token: "token-secret",
					payload: "private-payload",
					meta: "Public",
					notInSchema: "unknown-record-secret",
					...JSON.parse('{"__proto__":"Inert value"}'),
				}),
			]),
		]);
		const result = await loadListingCatalog("products");
		expect(result.products[0]).toMatchObject({
			permalink: "",
			imageUrl: "",
			fields: {
				custom: ["Cotton", "Linen"],
				obj: null,
				nan: null,
				meta: ["Public"],
			},
		});
		expect(Object.hasOwn(result.products[0].fields, "__proto__")).toBe(true);
		expect(
			result.fields.find(function metadata(field) {
				return field.id === "meta";
			}),
		).toEqual(field("meta", "Public label"));
		const json = JSON.stringify(result);
		for (const secret of [
			"ck_live",
			"cs_live",
			"token-secret",
			"private-payload",
			"metadata-secret",
			"object-secret",
			"unknown-record-secret",
		]) {
			expect(json).not.toContain(secret);
		}
	});

	it("expands Colour and Brand attributes without overwriting explicit semantic columns", async function attributeFacets() {
		const fields = [
			field("n", "Name"),
			field("a", "Attributes JSON"),
			field("brand-id", "Brand"),
		];
		vi.mocked(sdk.getCollections).mockResolvedValue([
			collection("products", "Products", fields, [
				item("1", {
					n: "Shoe",
					"brand-id": "Real brand",
					a: [
						{ name: "Colour", options: ["Red", "Blue"] },
						{ name: "Brand", options: ["Attribute brand"] },
					],
				}),
			]),
		]);
		expect(
			(await loadListingCatalog("products")).products[0].fields,
		).toMatchObject({ color: ["Red", "Blue"], brand: ["Real brand"] });
	});
});

describe("collection references and safety cap", function referenceTests() {
	it("resolves single/multiple references to public names, caching shared target reads", async function resolveReferences() {
		const taxonomy = collection(
			"taxonomy",
			"Categories",
			[field("title", "Title")],
			[
				item("cat-1", { title: "Sneakers" }),
				item("cat-2", { title: "Running" }),
			],
		);
		const products = collection(
			"products",
			"Products",
			[
				field("n", "Name"),
				{
					...field("cats", "Categories", "multiCollectionReference"),
					collectionId: "taxonomy",
				},
				{
					...field("brand-id", "Brand", "collectionReference"),
					collectionId: "taxonomy",
				},
			],
			[
				item("1", {
					n: "Shoe",
					cats: ["cat-1", "cat-2", "gone"],
					"brand-id": "cat-1",
				}),
			],
		);
		vi.mocked(sdk.getCollections).mockResolvedValue([products, taxonomy]);
		const result = await loadListingCatalog("products");
		expect(result.products[0].fields).toMatchObject({
			cats: ["Sneakers", "Running"],
			category: ["Sneakers", "Running"],
			"brand-id": ["Sneakers"],
			brand: ["Sneakers"],
		});
		expect(taxonomy.getItems).toHaveBeenCalledTimes(1);
		expect(taxonomy.getFields).toHaveBeenCalledTimes(1);
	});

	it("never reads or includes internal references and omits unresolved reference IDs", async function privateReferences() {
		const internal = collection(
			"private",
			INTERNAL_COLLECTION_NAME,
			[field("secret", "Name")],
			[item("credential-record", { secret: "private-key" })],
		);
		const broken = collection("broken", "Unavailable taxonomy");
		vi.mocked(broken.getItems).mockRejectedValue(new Error("No access"));
		const products = collection(
			"products",
			"Products",
			[
				field("n", "Name"),
				{
					...field("internal-ref", "Brand", "collectionReference"),
					collectionId: "private",
				},
				{
					...field("missing-ref", "Categories", "multiCollectionReference"),
					collectionId: "missing",
				},
				{
					...field("broken-ref", "Colour", "collectionReference"),
					collectionId: "broken",
				},
			],
			[
				item("1", {
					n: "Shoe",
					"internal-ref": "credential-record",
					"missing-ref": ["missing-record"],
					"broken-ref": "broken-record",
				}),
			],
		);
		vi.mocked(sdk.getCollections).mockResolvedValue([
			products,
			internal,
			broken,
		]);
		const result = await loadListingCatalog("products");
		expect(internal.getFields).not.toHaveBeenCalled();
		expect(internal.getItems).not.toHaveBeenCalled();
		expect(result.products[0].fields).toMatchObject({
			"missing-ref": [],
			"broken-ref": [],
			category: [],
			brand: [],
			color: [],
		});
		expect(
			result.fields.some(function privateField(field) {
				return field.id === "internal-ref";
			}),
		).toBe(false);
		expect(JSON.stringify(result)).not.toMatch(
			/credential-record|private-key|missing-record|broken-record/,
		);
	});

	it("accepts exactly 5000 items without the old 12-product truncation", async function capBoundary() {
		const items = Array.from({ length: 5000 }, function product(_, index) {
			return item(String(index), { n: `Shoe ${index}` });
		});
		vi.mocked(sdk.getCollections).mockResolvedValue([
			collection("products", "Products", [field("n", "Name")], items),
		]);
		const result = await loadListingCatalog("products");
		expect(result.products).toHaveLength(5000);
		expect(result.products[4999].name).toBe("Shoe 4999");
	});

	it("throws actionable overflow errors instead of silently truncating either explicit or active targets", async function overCap() {
		const items = Array.from({ length: 5001 }, function product(_, index) {
			return item(String(index), {});
		});
		vi.mocked(sdk.getCollections).mockResolvedValue([
			collection("products", "Products", [], items),
		]);
		await expect(loadListingCatalog("products")).rejects.toThrow(
			/5001.*5000-item snapshot safety limit.*smaller collection/,
		);
		connect(settings("products"));
		await expect(loadListingCatalog()).rejects.toThrow(
			/5000-item snapshot safety limit/,
		);
	});
});
