/** Public catalog values only. Never pass connection records or credentials here. */
export interface ListingProduct {
	id: string;
	name: string;
	price: number | null;
	regularPrice: number | null;
	imageUrl: string;
	description: string;
	rating: number | null;
	ratingCount: number | null;
	permalink: string;
	fields: Record<string, string[] | number | boolean | null>;
}
export interface ListingFilter {
	id: string;
	label: string;
	field: string;
	kind: "options" | "rating" | "price" | "color" | "discount";
	enabled: boolean;
}
export interface ListingConfig {
	/** Accessible catalog label, not a visible page title. */
	title: string;
	currency: string;
	pageSize: number;

	searchFields: string[];
	filters: ListingFilter[];
}
export type ListingSelection = Record<string, string[]>;

export const DEFAULT_LISTING_CONFIG: ListingConfig = {
	title: "Products",
	currency: "INR",
	pageSize: 20,

	searchFields: ["name", "description", "category"],
	filters: [
		{
			id: "category",
			label: "Category",
			field: "category",
			kind: "options",
			enabled: true,
		},
		{
			id: "rating",
			label: "Ratings",
			field: "rating",
			kind: "rating",
			enabled: true,
		},
		{
			id: "brand",
			label: "Brand",
			field: "brand",
			kind: "options",
			enabled: true,
		},
		{
			id: "price",
			label: "Price",
			field: "price",
			kind: "price",
			enabled: true,
		},
		{
			id: "color",
			label: "Color",
			field: "color",
			kind: "color",
			enabled: true,
		},
		{
			id: "discount",
			label: "Discount Range",
			field: "discount",
			kind: "discount",
			enabled: true,
		},
	],
};

/** Reject executable URL schemes from editable CMS data. */
export function safeLink(value: string): string | undefined {
	const trimmed = value.trim();
	if (
		!trimmed ||
		[...trimmed].some(function unsafe(character) {
			return character.charCodeAt(0) <= 32 || character === "\\";
		})
	)
		return undefined;
	if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
	if (trimmed.startsWith("#")) return trimmed;
	try {
		const url = new URL(trimmed);
		return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
	} catch {
		return undefined;
	}
}

export function numericValue(value: unknown): number | null {
	if (typeof value === "number") return Number.isFinite(value) ? value : null;
	if (typeof value !== "string" || !value.trim()) return null;
	const cleaned = value
		.trim()
		.replace(/^[^\d+\-.]+/, "")
		.replace(/,/g, "")
		.replace(/%$/, "");
	const parsed = Number(cleaned);
	return cleaned && Number.isFinite(parsed) ? parsed : null;
}

export function formatMoney(value: number | null, currency: string): string {
	if (value === null) return "Price on request";
	try {
		return new Intl.NumberFormat("en-IN", {
			style: "currency",
			currency,
			minimumFractionDigits: 2,
		}).format(value);
	} catch {
		return value.toFixed(2);
	}
}

export function productValue(
	product: ListingProduct,
	field: string,
): string[] | number | boolean | null {
	// Explicit CMS IDs take precedence over semantic convenience fields.
	if (Object.prototype.hasOwnProperty.call(product.fields, field))
		return product.fields[field];
	if (field === "name" || field === "description") return [product[field]];
	if (field === "price" || field === "regularPrice" || field === "rating")
		return product[field];
	if (field === "discount") {
		return product.price !== null &&
			product.regularPrice !== null &&
			product.regularPrice > 0
			? Math.max(0, (1 - product.price / product.regularPrice) * 100)
			: null;
	}
	return null;
}

function matchesOption(
	product: ListingProduct,
	filter: ListingFilter,
	value: string,
): boolean {
	const raw = productValue(product, filter.field);
	if (filter.kind === "rating" || filter.kind === "discount") {
		const number = numericValue(Array.isArray(raw) ? raw[0] : raw);
		return number !== null && number >= Number(value);
	}
	if (filter.kind === "price") {
		const number = numericValue(Array.isArray(raw) ? raw[0] : raw);
		if (number === null) return false;
		const [min, max] = value.split(":").map(Number);
		return number >= min && number < max;
	}
	const entries = Array.isArray(raw)
		? raw
		: raw === null
			? []
			: [typeof raw === "boolean" ? (raw ? "Yes" : "No") : String(raw)];
	return entries.some(function same(entry) {
		return (
			entry.trim().toLocaleLowerCase() === value.trim().toLocaleLowerCase()
		);
	});
}

/** OR within each facet, AND across facets. Search runs before pagination. */
export function filterProducts(
	products: ListingProduct[],
	config: ListingConfig,
	query: string,
	selection: ListingSelection,
): ListingProduct[] {
	const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
	return products.filter(function matches(product) {
		const search = config.searchFields
			.flatMap(function read(field) {
				const value = productValue(product, field);
				return Array.isArray(value)
					? value
					: value === null
						? []
						: [String(value)];
			})
			.join(" ")
			.toLocaleLowerCase();
		if (
			!words.every(function contains(word) {
				return search.includes(word);
			})
		)
			return false;
		return config.filters.every(function facet(filter) {
			const values = selection[filter.id] || [];
			return (
				!filter.enabled ||
				values.length === 0 ||
				values.some(function option(value) {
					return matchesOption(product, filter, value);
				})
			);
		});
	});
}

export function getFilterOptions(
	products: ListingProduct[],
	filter: ListingFilter,
	currency: string,
): Array<{ value: string; label: string; count: number }> {
	let options: Array<{ value: string; label: string }>;
	if (filter.kind === "rating")
		options = [4.5, 4, 3.5, 3].map(function threshold(value) {
			return { value: String(value), label: `${value.toFixed(1)} & up` };
		});
	else if (filter.kind === "discount")
		options = [10, 20, 30, 40].map(function threshold(value) {
			return { value: String(value), label: `${value}% and above` };
		});
	else if (filter.kind === "price") {
		const numbers = products
			.map(function number(product) {
				const raw = productValue(product, filter.field);
				return numericValue(Array.isArray(raw) ? raw[0] : raw);
			})
			.filter(function valid(value): value is number {
				return value !== null && value >= 0;
			});
		const max = Math.max(1, ...numbers);
		const step = Math.max(1, Math.ceil(max / 5));
		options = Array.from({ length: 5 }, function tier(_, index) {
			const low = index * step;
			const high = (index + 1) * step;
			return {
				value: `${low}:${index === 4 ? "Infinity" : high}`,
				label:
					index === 4
						? `${formatMoney(low, currency)} and above`
						: `${formatMoney(low, currency)} to ${formatMoney(high, currency)}`,
			};
		});
	} else {
		const names = new Set<string>();
		for (const product of products) {
			const raw = productValue(product, filter.field);
			const values = Array.isArray(raw)
				? raw
				: raw === null
					? []
					: [typeof raw === "boolean" ? (raw ? "Yes" : "No") : String(raw)];
			for (const value of values) if (value.trim()) names.add(value.trim());
		}
		options = [...names]
			.sort(function alphabetic(a, b) {
				return a.localeCompare(b);
			})
			.map(function option(value) {
				return { value, label: value };
			});
	}
	return options.map(function counted(option) {
		return {
			...option,
			count: products.filter(function matches(product) {
				return matchesOption(product, filter, option.value);
			}).length,
		};
	});
}

export function sortProducts(
	products: ListingProduct[],
	sort: string,
): ListingProduct[] {
	return [...products].sort(function compare(a, b) {
		if (sort === "name") return a.name.localeCompare(b.name);
		if (sort === "price-asc")
			return (a.price ?? Infinity) - (b.price ?? Infinity);
		if (sort === "price-desc")
			return (b.price ?? -Infinity) - (a.price ?? -Infinity);
		if (sort === "rating") return (b.rating ?? -1) - (a.rating ?? -1);
		return (b.ratingCount ?? 0) - (a.ratingCount ?? 0);
	});
}

/** Explicit demo data, used only before selecting a CMS collection. */
export function demoListingProducts(): ListingProduct[] {
	const photos = [
		"1542291026-7eec264c27ff",
		"1549298916-b41d501d3772",
		"1600185365926-3a2ce3cdb9eb",
		"1600269452121-4f2416e55c28",
		"1543508282-6319a3e2621f",
		"1600185365483-26d7a4cc7519",
	];
	const colors = [
		"Blue",
		"Yellow",
		"White",
		"Red",
		"Black",
		"Green",
		"Pink",
		"Multi",
	];
	return Array.from({ length: 24 }, function demo(_, index) {
		return {
			id: `demo-${index}`,
			name: "TDX Sinkers",
			price: 675,
			regularPrice: 675 + (index % 5) * 250,
			imageUrl: `https://images.unsplash.com/photo-${photos[index % photos.length]}?auto=format&fit=crop&w=600&q=85`,
			description: "5 types of shoes available",
			rating: 4.5 - (index % 4) * 0.5,
			ratingCount: 121,
			permalink: "",
			fields: {
				category: [
					["Sneakers", "Running Shoes", "Casual Shoes", "Sports Shoes"][
						index % 4
					],
				],
				brand: [
					[
						"Kalini",
						"7Threads",
						"Varanga",
						"Sangria",
						"Vishudh",
						"Ethnic basket",
					][index % 6],
				],
				color: [colors[index % colors.length]],
			},
		};
	});
}
