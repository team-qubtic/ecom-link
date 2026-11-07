import { describe, expect, it } from "vitest";
import {
	DEFAULT_LISTING_CONFIG,
	filterProducts,
	formatMoney,
	getFilterOptions,
	numericValue,
	productValue,
	safeLink,
	sortProducts,
	type ListingConfig,
	type ListingFilter,
	type ListingProduct,
} from "../listingModel";

function product(
	id: string,
	overrides: Partial<ListingProduct> = {},
): ListingProduct {
	return {
		id,
		name: id,
		description: "",
		price: null,
		regularPrice: null,
		rating: null,
		ratingCount: null,
		imageUrl: "",
		permalink: "",
		fields: {},
		...overrides,
	};
}

function facet(
	field: string,
	kind: ListingFilter["kind"] = "options",
): ListingFilter {
	return { id: `filter-${field}`, label: field, field, kind, enabled: true };
}

function settings(
	filters: ListingFilter[] = [],
	searchFields = ["name"],
): ListingConfig {
	return { ...DEFAULT_LISTING_CONFIG, filters, searchFields };
}

function ids(products: ListingProduct[]): string[] {
	return products.map(function read(product) {
		return product.id;
	});
}

function freezeDeep<T>(value: T): T {
	if (value !== null && typeof value === "object") {
		Object.values(value).forEach(function freeze(entry) {
			freezeDeep(entry);
		});
		Object.freeze(value);
	}
	return value;
}

describe("default listing settings", function () {
	it("defines only listing controls and keeps the product brand facet", function () {
		expect(Object.keys(DEFAULT_LISTING_CONFIG).sort()).toEqual([
			"currency",
			"filters",
			"pageSize",
			"searchFields",
			"title",
		]);
		expect(DEFAULT_LISTING_CONFIG).toMatchObject({
			title: "Products",
			currency: "INR",
			pageSize: 20,
			searchFields: ["name", "description", "category"],
		});
		expect(DEFAULT_LISTING_CONFIG.filters).toHaveLength(6);
		expect(DEFAULT_LISTING_CONFIG.filters).toContainEqual({
			id: "brand",
			label: "Brand",
			field: "brand",
			kind: "options",
			enabled: true,
		});
	});
});

describe("filterProducts", function () {
	const products = [
		product("red-runner", {
			name: "Red Runner",
			description: "LIGHTWEIGHT trail shoe",
			fields: {
				category: ["Running", "Sports"],
				brand: ["Aster"],
				color: ["Red"],
			},
		}),
		product("blue-boot", {
			name: "Blue Boot",
			description: "Waterproof trail boot",
			fields: { category: ["Boots"], brand: ["Aster"], color: ["Blue"] },
		}),
		product("red-boot", {
			name: "Red Boot",
			fields: { category: ["Boots"], brand: ["Other"], color: ["Red"] },
		}),
		product("sandal", { fields: { category: ["Sandals"], brand: ["Aster"] } }),
		product("missing"),
	];

	it("uses OR within a facet and AND across facets, matching options case-insensitively", function () {
		const config = settings([
			facet("category"),
			facet("brand"),
			facet("color", "color"),
		]);
		expect(
			ids(
				filterProducts(products, config, "", {
					"filter-category": ["running", "BOOTS"],
					"filter-brand": ["ASTER"],
				}),
			),
		).toEqual(["red-runner", "blue-boot"]);
		expect(
			ids(
				filterProducts(products, config, "", {
					"filter-category": ["running", "BOOTS"],
					"filter-brand": ["ASTER"],
					"filter-color": ["rEd"],
				}),
			),
		).toEqual(["red-runner"]);
	});

	it("ignores disabled, unselected and unknown facets without dropping missing values", function () {
		const config = settings([
			{ ...facet("category"), enabled: false },
			facet("brand"),
		]);
		expect(
			filterProducts(products, config, " \t ", {
				"filter-category": ["not present"],
				"filter-brand": [],
				unknown: ["no"],
			}),
		).toEqual(products);
		expect(
			filterProducts(products, settings([facet("absent")]), "", {
				"filter-absent": ["anything"],
			}),
		).toEqual([]);
	});

	it("requires every search word, independent of order, casing and whitespace, across configured fields", function () {
		const config = settings([], ["name", "description", "category"]);
		expect(
			ids(filterProducts(products, config, "  TRAIL\tred\nRUNNING  ", {})),
		).toEqual(["red-runner"]);
		expect(filterProducts(products, config, "trail missing", {})).toEqual([]);
		expect(
			filterProducts(products, settings([], ["name"]), "waterproof", {}),
		).toEqual([]);
		expect(filterProducts(products, settings([], []), "Red", {})).toEqual([]);
	});

	it("searches custom CMS IDs, numeric zero and booleans but not unconfigured fields", function () {
		const data = [
			product("custom", {
				fields: {
					"cms-label": ["Ocean", "Cotton"],
					stock: 0,
					available: false,
					private: ["hidden"],
				},
			}),
		];
		const config = settings([], ["cms-label", "stock", "available", "missing"]);
		expect(filterProducts(data, config, "COTTON ocean 0 FALSE", {})).toEqual(
			data,
		);
		expect(filterProducts(data, config, "hidden", {})).toEqual([]);
	});

	it("combines search with facets without paginating the model results", function () {
		const config = {
			...settings([facet("brand")], ["description"]),
			pageSize: 1,
		};
		expect(
			ids(
				filterProducts(products, config, "trail", {
					"filter-brand": ["aster"],
				}),
			),
		).toEqual(["red-runner", "blue-boot"]);
	});

	it("filters boolean and zero options without treating them as missing", function () {
		const data = [
			product("zero", { fields: { stock: 0, available: false } }),
			product("one", { fields: { stock: 1, available: true } }),
			product("missing"),
		];
		expect(
			ids(
				filterProducts(
					data,
					settings([facet("stock"), facet("available")]),
					"",
					{
						"filter-stock": ["0"],
						"filter-available": ["no"],
					},
				),
			),
		).toEqual(["zero"]);
	});
});

describe("numeric values and configured CMS numeric facets", function () {
	it.each([
		[0, 0],
		[12.5, 12.5],
		[-2, -2],
		["0", 0],
		["  ₹1,234.50  ", 1234.5],
		["USD 2,000", 2000],
		["25%", 25],
		["-12.5", -12.5],
		["+3", 3],
		[null, null],
		[undefined, null],
		["", null],
		["   ", null],
		[false, null],
		[NaN, null],
		[Infinity, null],
		[-Infinity, null],
		["not a number", null],
		["₹", null],
		["12oops", null],
		[[], null],
		[{ value: 4 }, null],
	])("normalizes %j to %j", function (value, expected) {
		expect(numericValue(value)).toBe(expected);
	});

	it.each([
		{
			kind: "rating" as const,
			field: "cms-score",
			selected: "4.5",
			match: ["4.5"],
			miss: ["4.49"],
		},
		{
			kind: "price" as const,
			field: "cms-cost",
			selected: "1000:2000",
			match: ["₹1,000.00"],
			miss: ["₹2,000.00"],
		},
		{
			kind: "discount" as const,
			field: "cms-saving",
			selected: "20",
			match: ["20%"],
			miss: ["19.99%"],
		},
	])(
		"uses $field rather than the semantic $kind property",
		function ({ kind, field, selected, match, miss }) {
			const filter = facet(field, kind);
			const data = [
				product("match", {
					price: 9999,
					regularPrice: 10000,
					rating: 0,
					fields: { [field]: match },
				}),
				product("below-or-upper-bound", {
					price: 1500,
					regularPrice: 3000,
					rating: 5,
					fields: { [field]: miss },
				}),
				product("missing", { price: 1500, regularPrice: 3000, rating: 5 }),
				product("invalid", { fields: { [field]: ["unknown"] } }),
			];
			expect(
				ids(
					filterProducts(data, settings([filter]), "", {
						[filter.id]: [selected],
					}),
				),
			).toEqual(["match"]);
			expect(
				getFilterOptions(data, filter, "USD").some(function counted(option) {
					return option.count > 0;
				}),
			).toBe(true);
		},
	);

	it("keeps numeric CMS zeros and excludes missing values even at a zero threshold", function () {
		for (const kind of ["price", "rating", "discount"] as const) {
			const filter = facet("cms-number", kind);
			const data = [
				product("zero", { fields: { "cms-number": 0 } }),
				product("formatted-zero", { fields: { "cms-number": ["0%"] } }),
				product("missing"),
				product("null", { fields: { "cms-number": null } }),
			];
			expect(
				ids(
					filterProducts(data, settings([filter]), "", {
						[filter.id]: [kind === "price" ? "0:1" : "0"],
					}),
				),
			).toEqual(["zero", "formatted-zero"]);
		}
	});

	it("gives explicit CMS IDs precedence, including null, false and zero", function () {
		const data = product("override", {
			name: "Semantic name",
			price: 100,
			rating: 5,
			fields: { name: ["CMS name"], price: 0, rating: null, discount: false },
		});
		expect(productValue(data, "name")).toEqual(["CMS name"]);
		expect(productValue(data, "price")).toBe(0);
		expect(productValue(data, "rating")).toBeNull();
		expect(productValue(data, "discount")).toBe(false);
		expect(productValue(data, "missing")).toBeNull();
		expect(
			productValue(
				product("semantic", { description: "Details", regularPrice: 100 }),
				"description",
			),
		).toEqual(["Details"]);
		expect(
			productValue(product("semantic", { regularPrice: 100 }), "regularPrice"),
		).toBe(100);
	});
});

describe("filter options and counts", function () {
	it("sorts unique labels and counts products, not repeated values in a product", function () {
		const data = [
			product("a", { fields: { tags: ["Red", "Red", "Blue", "", "   "] } }),
			product("b", { fields: { tags: ["Red"] } }),
			product("missing"),
		];
		expect(getFilterOptions(data, facet("tags"), "USD")).toEqual([
			{ value: "Blue", label: "Blue", count: 1 },
			{ value: "Red", label: "Red", count: 2 },
		]);
		expect(
			getFilterOptions(
				[product("zero", { fields: { stock: 0 } }), product("missing")],
				facet("stock"),
				"USD",
			),
		).toEqual([{ value: "0", label: "0", count: 1 }]);
		expect(
			getFilterOptions(
				[
					product("false", { fields: { active: false } }),
					product("true", { fields: { active: true } }),
				],
				facet("active"),
				"USD",
			),
		).toEqual([
			{ value: "No", label: "No", count: 1 },
			{ value: "Yes", label: "Yes", count: 1 },
		]);
	});

	it("counts and matches the trimmed option values it exposes for padded CMS labels", function () {
		const data = [
			product("padded", { fields: { tags: [" Red ", "\tBlue\t"] } }),
		];
		const filter = facet("tags");
		expect.soft(getFilterOptions(data, filter, "USD")).toEqual([
			{ value: "Blue", label: "Blue", count: 1 },
			{ value: "Red", label: "Red", count: 1 },
		]);
		expect(
			ids(
				filterProducts(data, settings([filter]), "", { [filter.id]: ["Red"] }),
			),
		).toEqual(["padded"]);
	});

	it("counts inclusive rating and discount thresholds using their configured CMS columns", function () {
		const data = [
			product("a", { fields: { score: 4.5, saving: ["40%"] } }),
			product("b", { fields: { score: ["4.0"], saving: 20 } }),
			product("c", { fields: { score: 3, saving: 0 } }),
			product("missing"),
		];
		expect(getFilterOptions(data, facet("score", "rating"), "USD")).toEqual([
			{ value: "4.5", label: "4.5 & up", count: 1 },
			{ value: "4", label: "4.0 & up", count: 2 },
			{ value: "3.5", label: "3.5 & up", count: 2 },
			{ value: "3", label: "3.0 & up", count: 3 },
		]);
		expect(getFilterOptions(data, facet("saving", "discount"), "USD")).toEqual([
			{ value: "10", label: "10% and above", count: 2 },
			{ value: "20", label: "20% and above", count: 2 },
			{ value: "30", label: "30% and above", count: 1 },
			{ value: "40", label: "40% and above", count: 1 },
		]);
	});

	it("builds five price ranges from the custom column with inclusive lows and exclusive highs", function () {
		const filter = facet("cost", "price");
		const data = [0, 100, 200, 300, 400, 500].map(function priced(value) {
			return product(String(value), {
				price: 99999,
				fields: { cost: [`$${value.toFixed(2)}`] },
			});
		});
		data.push(
			product("missing"),
			product("invalid", { fields: { cost: ["unknown"] } }),
			product("negative", { fields: { cost: -10 } }),
		);
		const options = getFilterOptions(data, filter, "USD");
		expect(
			options.map(function range(option) {
				return [option.value, option.count];
			}),
		).toEqual([
			["0:100", 1],
			["100:200", 1],
			["200:300", 1],
			["300:400", 1],
			["400:Infinity", 2],
		]);
		expect(options[0].label).toBe(
			`${formatMoney(0, "USD")} to ${formatMoney(100, "USD")}`,
		);
		expect(options[4].label).toBe(`${formatMoney(400, "USD")} and above`);
	});

	it("provides finite zero-count numeric options for empty catalogs", function () {
		expect(getFilterOptions([], facet("category"), "USD")).toEqual([]);
		for (const kind of ["price", "rating", "discount"] as const) {
			const options = getFilterOptions([], facet("missing", kind), "USD");
			expect(options.length).toBe(kind === "price" ? 5 : 4);
			expect(
				options.every(function empty(option) {
					return option.count === 0;
				}),
			).toBe(true);
			expect(
				options.some(function invalid(option) {
					return /NaN|undefined/.test(option.label);
				}),
			).toBe(false);
		}
	});
});

describe("calculated discounts and money", function () {
	it.each([
		[75, 100, 25],
		[0, 100, 100],
		[100, 100, 0],
		[125, 100, 0],
		[null, 100, null],
		[75, null, null],
		[75, 0, null],
		[75, -100, null],
	])(
		"calculates discount for price %s and regular price %s",
		function (price, regularPrice, expected) {
			expect(
				productValue(product("sale", { price, regularPrice }), "discount"),
			).toBe(expected);
		},
	);

	it("counts calculated discounts without including missing prices as free products", function () {
		const data = [
			product("sale", { price: 75, regularPrice: 100 }),
			product("free", { price: 0, regularPrice: 100 }),
			product("missing", { regularPrice: 100 }),
		];
		expect(
			getFilterOptions(data, facet("discount", "discount"), "USD").map(
				function count(option) {
					return option.count;
				},
			),
		).toEqual([2, 2, 1, 1]);
	});

	it("formats zero separately from missing prices and tolerates an invalid currency", function () {
		expect(formatMoney(null, "USD")).toBe("Price on request");
		expect(formatMoney(0, "USD")).toBe(
			new Intl.NumberFormat("en-IN", {
				style: "currency",
				currency: "USD",
				minimumFractionDigits: 2,
			}).format(0),
		);
		expect(formatMoney(12.5, "not-a-currency")).toBe("12.50");
	});
});

describe("safeLink", function () {
	it.each([
		[
			" https://example.com/p?q=1#details ",
			"https://example.com/p?q=1#details",
		],
		["HTTP://EXAMPLE.COM", "http://example.com/"],
		["/products/shoes", "/products/shoes"],
		["#details", "#details"],
	])("allows %s", function (input, expected) {
		expect(safeLink(input)).toBe(expected);
	});

	it.each([
		"",
		"   ",
		"javascript:alert(1)",
		"JaVaScRiPt:alert(1)",
		"data:text/html,<script>alert(1)</script>",
		"vbscript:msgbox(1)",
		"file:///etc/passwd",
		"mailto:test@example.com",
		"//evil.example/p",
		"\\evil.example",
		"/\\evil.example",
		"https://example.com/a b",
		"https://example.com/\npath",
		"https://example.com/\u0000path",
		"not-a-url",
		"https://",
		"http://[broken",
	])("rejects unsafe or invalid URL %j", function (input) {
		expect(safeLink(input)).toBeUndefined();
	});
});

describe("sorting and immutability", function () {
	const data = [
		product("b", { name: "Bravo", price: 20, rating: 4, ratingCount: 10 }),
		product("missing", { name: "Delta" }),
		product("a", { name: "Alpha", price: 0, rating: 0, ratingCount: 0 }),
		product("c", { name: "Charlie", price: 10, rating: 5, ratingCount: 20 }),
	];

	it.each([
		["name", ["a", "b", "c", "missing"]],
		["price-asc", ["a", "c", "b", "missing"]],
		["price-desc", ["b", "c", "a", "missing"]],
		["rating", ["c", "b", "a", "missing"]],
		["popular", ["c", "b", "missing", "a"]],
	])(
		"sorts %s, preserving real zero values and putting missing numeric values last",
		function (sort, expected) {
			const frozen = freezeDeep(structuredClone(data));
			const sorted = sortProducts(frozen, sort);
			expect(ids(sorted)).toEqual(expected);
			expect(sorted).not.toBe(frozen);
			expect(frozen).toEqual(data);
			expect(
				sorted.find(function same(product) {
					return product.id === "b";
				}),
			).toBe(frozen[0]);
		},
	);

	it("does not mutate products, fields, configuration or selections while filtering and counting", function () {
		const products = freezeDeep([
			product("a", { fields: { tags: ["Blue", "Red"] } }),
			product("b", { fields: { tags: ["Red"] } }),
		]);
		const filter = facet("tags");
		const config = freezeDeep(settings([filter], ["tags"]));
		const selection = freezeDeep({ [filter.id]: ["red"] });
		const before = structuredClone({ products, config, selection });
		const filtered = filterProducts(products, config, "RED", selection);
		expect(filtered).toEqual(products);
		expect(filtered).not.toBe(products);
		expect(filtered[0]).toBe(products[0]);
		getFilterOptions(products, filter, "USD");
		expect({ products, config, selection }).toEqual(before);
	});
});
