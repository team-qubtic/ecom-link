/** @vitest-environment jsdom */
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { ShoporaListing } from "../ShoporaListing";
import {
	filterProducts,
	getFilterOptions,
	type ListingConfig,
	type ListingProduct,
} from "../listingModel";

const categories = [
	"Sneakers",
	"Boots",
	"Loafers",
	"Sandals",
	"Trainers",
	"Flats",
	"Heels",
	"Slippers",
];
const products: ListingProduct[] = Array.from(
	{ length: 45 },
	function (_, index) {
		return {
			id: `shoe-${index + 1}`,
			name: `Shoe ${String(index + 1).padStart(2, "0")}`,
			price: index + 10,
			regularPrice: index + 20,
			imageUrl: "",
			description: "Comfortable everyday shoes.",
			rating: 4.5,
			ratingCount: index + 1,
			permalink: `/product/shoe-${index + 1}`,
			fields: {
				category: [categories[index % 8]],
				brand: [index % 2 ? "Stride" : "Aster"],
				color: [index % 2 ? "Blue" : "Red"],
			},
		};
	},
);
const config: ListingConfig = {
	title: "Man’s Wears",
	currency: "USD",
	pageSize: 20,
	searchFields: ["name", "description"],
	filters: [
		{
			id: "category",
			label: "Category",
			field: "category",
			kind: "options",
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
			id: "rating",
			label: "Rating",
			field: "rating",
			kind: "rating",
			enabled: true,
		},
		{
			id: "discount",
			label: "Discount",
			field: "discount",
			kind: "discount",
			enabled: true,
		},
	],
};

beforeAll(function () {
	// jsdom has no top layer. Browsers implement focus trapping and Escape natively.
	Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
		configurable: true,
		value: function (this: HTMLDialogElement) {
			this.setAttribute("open", "");
		},
	});
	Object.defineProperty(HTMLDialogElement.prototype, "close", {
		configurable: true,
		value: function (this: HTMLDialogElement) {
			this.removeAttribute("open");
		},
	});
});
afterEach(function () {
	cleanup();
	vi.restoreAllMocks();
});

function storefront(data = products, settings = config) {
	return (
		<React.StrictMode>
			<ShoporaListing products={data} config={settings} />
		</React.StrictMode>
	);
}

describe("ShoporaListing", function () {
	it("preserves quoted CSS selectors and font names in server-rendered Framer output", function () {
		const html = renderToStaticMarkup(
			<ShoporaListing products={products} config={config} />,
		);
		const css = html.match(/<style>([\s\S]*?)<\/style>/)?.[1];
		expect(css).toContain('"Helvetica Neue"');
		expect(css).toContain('[aria-pressed="true"]');
		expect(css).not.toContain("&quot;");
	});
	it("renders 20 products, six configured filter sections and graceful image fallbacks", function () {
		const ui = render(storefront());
		expect(ui.getAllByRole("article")).toHaveLength(20);
		config.filters.forEach(function (filter) {
			expect(ui.getByRole("group", { name: filter.label })).toBeTruthy();
		});
		expect(ui.getAllByText("Image unavailable")).toHaveLength(20);
		expect(ui.getByRole("status").textContent).toMatch(/1 to 20.*45/);
	});

	it("paginates and resets to the first page when searching", function () {
		const ui = render(storefront());
		fireEvent.click(ui.getByRole("button", { name: "Page 3" }));
		expect(ui.getAllByRole("article")).toHaveLength(5);
		expect(ui.getByRole("status").textContent).toMatch(/41 to 45/);
		fireEvent.change(ui.getByRole("searchbox"), {
			target: { value: "Shoe 01" },
		});
		expect(ui.getAllByRole("article")).toHaveLength(1);
		expect(ui.queryByRole("navigation", { name: "Catalog pages" })).toBeNull();
		fireEvent.click(ui.getByRole("button", { name: "Clear search" }));
		expect(ui.getAllByRole("article")).toHaveLength(20);
	});

	it("expands filter options and combines OR within a section with AND across sections", function () {
		const ui = render(storefront());
		const category = ui.getByRole("group", { name: "Category" });
		expect(within(category).getAllByRole("checkbox")).toHaveLength(6);
		fireEvent.click(ui.getByRole("button", { name: "Show more (2)" }));
		expect(within(category).getAllByRole("checkbox")).toHaveLength(8);
		fireEvent.click(
			within(category).getByRole("checkbox", { name: /Sneakers/ }),
		);
		expect(ui.getAllByRole("article")).toHaveLength(6);
		fireEvent.click(within(category).getByRole("checkbox", { name: /Boots/ }));
		expect(ui.getAllByRole("article")).toHaveLength(12);
		const brand = ui.getByRole("group", { name: "Brand" });
		expect(
			within(brand).getByRole("checkbox", { name: /Aster/ }).parentElement
				?.textContent,
		).toContain("(6)");
		fireEvent.click(within(brand).getByRole("checkbox", { name: /Aster/ }));
		expect(ui.getAllByRole("article")).toHaveLength(6);
	});

	it("keeps original price buckets and counts their actual matches after narrowing the catalog", function () {
		const ui = render(storefront());
		const priceFilter = config.filters.find(function (filter) {
			return filter.kind === "price";
		})!;
		const originalOptions = getFilterOptions(
			products,
			priceFilter,
			config.currency,
		);
		fireEvent.change(ui.getByRole("searchbox"), {
			target: { value: "Shoe 01" },
		});
		const available = filterProducts(products, config, "Shoe 01", {});
		const priceConfig = { ...config, searchFields: [], filters: [priceFilter] };
		const group = ui.getByRole("group", { name: "Price" });
		const radios = within(group).getAllByRole("checkbox") as HTMLInputElement[];
		originalOptions.forEach(function (option) {
			const input = radios.find(function (radio) {
				return radio.value === option.value;
			});
			expect(input).toBeTruthy();
			const row = input?.closest("label");
			const expectedCount = filterProducts(available, priceConfig, "", {
				[priceFilter.id]: [option.value],
			}).length;
			expect(row?.querySelector(".shopora-option-label")?.textContent).toBe(
				option.label,
			);
			expect(
				row?.querySelector(".shopora-option-count")?.textContent?.trim(),
			).toBe(`(${expectedCount})`);
		});
		const matching = originalOptions.find(function (option) {
			return (
				filterProducts(available, priceConfig, "", {
					[priceFilter.id]: [option.value],
				}).length === 1
			);
		})!;
		fireEvent.click(
			radios.find(function (radio) {
				return radio.value === matching.value;
			})!,
		);
		expect(ui.getAllByRole("article")).toHaveLength(1);
	});

	it("renders only the listing section without site chrome or template destinations", function () {
		const ui = render(storefront());
		expect(ui.queryByRole("banner")).toBeNull();
		expect(ui.queryByRole("contentinfo")).toBeNull();
		expect(ui.queryByRole("heading", { level: 1 })).toBeNull();
		expect(ui.queryByRole("navigation", { name: "Product categories" })).toBeNull();
		expect(ui.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
		expect(ui.container.querySelector(".shopora-title-band")).toBeNull();
		expect(Array.from(ui.container.querySelectorAll("a[href]")).every(function (link) { return link.getAttribute("href")?.startsWith("/product/"); })).toBe(true);
		expect(ui.getByRole("main").contains(ui.getByRole("searchbox"))).toBe(true);
		expect(ui.getByRole("main").contains(ui.getByRole("button", { name: "Wishlist, 0 saved products" }))).toBe(true);
	});

	it("clear all resets both the query and filter selections", function () {
		const ui = render(storefront());
		fireEvent.change(ui.getByRole("searchbox"), { target: { value: "Shoe" } });
		fireEvent.click(
			within(ui.getByRole("group", { name: "Brand" })).getByRole("checkbox", {
				name: /Aster/,
			}),
		);
		fireEvent.click(ui.getAllByRole("button", { name: "Clear all" })[0]);
		expect((ui.getByRole("searchbox") as HTMLInputElement).value).toBe("");
		expect(
			(
				within(ui.getByRole("group", { name: "Brand" })).getByRole("checkbox", {
					name: /Aster/,
				}) as HTMLInputElement
			).checked,
		).toBe(false);
		expect(ui.getAllByRole("article")).toHaveLength(20);
	});

	it("sorts by price and resets pagination", function () {
		const ui = render(storefront());
		fireEvent.click(ui.getByRole("button", { name: "Page 2" }));
		fireEvent.change(ui.getByRole("combobox"), {
			target: { value: "price-desc" },
		});
		expect(ui.getAllByRole("article")[0].getAttribute("aria-label")).toBe(
			"Shoe 45",
		);
		expect(ui.getByRole("status").textContent).toMatch(/1 to 20/);
	});

	it("filters the wishlist and shows an empty state after removing its last product", function () {
		const ui = render(storefront());
		const first = ui.getAllByRole("article")[0];
		fireEvent.click(
			within(first).getByRole("button", { name: /^Save .* to wishlist$/ }),
		);
		fireEvent.click(
			ui.getByRole("button", { name: "Wishlist, 1 saved product" }),
		);
		expect(ui.getAllByRole("article")).toHaveLength(1);
		fireEvent.click(
			ui.getByRole("button", { name: /^Remove .* from wishlist$/ }),
		);
		expect(ui.queryAllByRole("article")).toHaveLength(0);
		expect(
			ui.getByRole("heading", { name: "Your Wishlist Is Empty" }),
		).toBeTruthy();
		fireEvent.click(ui.getByRole("button", { name: "View all products" }));
		expect(ui.getAllByRole("article")).toHaveLength(20);
	});

	it("opens quick view, focuses close, responds to native Escape cancellation and restores focus", function () {
		const ui = render(storefront());
		const trigger = ui.getAllByRole("button", { name: /^Quick view / })[0];
		trigger.focus();
		fireEvent.click(trigger);
		const dialog = ui.getByRole("dialog");
		expect(document.activeElement).toBe(
			within(dialog).getByRole("button", { name: "Close quick view" }),
		);
		fireEvent(dialog, new Event("cancel", { cancelable: true }));
		expect(ui.queryByRole("dialog")).toBeNull();
		expect(document.activeElement).toBe(trigger);
	});

	it("restores focus to the results if the quick-view trigger disappears", function () {
		const ui = render(storefront());
		fireEvent.click(
			within(ui.getAllByRole("article")[0]).getByRole("button", {
				name: /^Save .* to wishlist$/,
			}),
		);
		fireEvent.click(
			ui.getByRole("button", { name: "Wishlist, 1 saved product" }),
		);
		fireEvent.click(ui.getByRole("button", { name: /^Quick view / }));
		const dialog = ui.getByRole("dialog");
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Saved to wishlist" }),
		);
		expect(ui.queryAllByRole("article")).toHaveLength(0);
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Close quick view" }),
		);
		expect(document.activeElement).toBe(ui.getByRole("status").parentElement);
	});

	it("switches list view and clamps pages when the catalog shrinks", function () {
		const ui = render(storefront());
		fireEvent.click(ui.getByRole("button", { name: "List view" }));
		expect(
			ui.container
				.querySelector(".shopora-product-grid")
				?.getAttribute("data-view"),
		).toBe("list");
		fireEvent.click(ui.getByRole("button", { name: "Page 3" }));
		ui.rerender(storefront(products.slice(0, 2)));
		expect(ui.getAllByRole("article")).toHaveLength(2);
		expect(ui.getByRole("status").textContent).toMatch(/1 to 2.*2 results/);
		ui.rerender(storefront());
		expect(ui.getByRole("status").textContent).toMatch(/1 to 20/);
	});

	it("keeps search and wishlist available without filters", function () {
		const ui = render(
			storefront(products, {
				...config,
				filters: [],
			}),
		);
		expect(ui.getByRole("searchbox")).toBeTruthy();
		expect(
			ui.getByRole("button", { name: "Wishlist, 0 saved products" }),
		).toBeTruthy();
		expect(ui.queryByRole("contentinfo")).toBeNull();
		expect(
			ui.container
				.querySelector(".shopora-catalog")
				?.getAttribute("data-has-filters"),
		).toBe("false");
	});

	it("isolates radio groups and search input IDs across instances", function () {
		const ui = render(
			<>
				<ShoporaListing products={products} config={config} />
				<ShoporaListing products={products} config={config} />
			</>,
		);
		const instances = ui.container.querySelectorAll(".shopora-storefront");
		const first =
			instances[0].querySelector<HTMLInputElement>("input[type=radio]");
		const second =
			instances[1].querySelector<HTMLInputElement>("input[type=radio]");
		expect(first?.name).not.toBe(second?.name);
		const searches = ui.getAllByRole("searchbox");
		expect(searches[0].id).not.toBe(searches[1].id);
	});
});
