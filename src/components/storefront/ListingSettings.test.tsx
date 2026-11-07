/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import type { ListingConfig } from "../../storefront/listingModel";
import { ListingSettings } from "./ListingSettings";

function makeConfig(): ListingConfig {
	return {
		title: "Shoes",
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
}

const fields = [{ id: "cms-material-42", name: "Material", type: "string" }];

afterEach(cleanup);

describe("ListingSettings", function () {
	it("renders the six supplied defaults without changing the config on mount", function () {
		const onChange = vi.fn();
		const view = render(
			<ListingSettings
				config={makeConfig()}
				onChange={onChange}
				fields={fields}
			/>,
		);
		expect(view.getAllByRole("switch", { name: /^Enable / })).toHaveLength(6);
		expect(view.container.querySelector("select")).toBeNull();
		expect(view.getByLabelText("Catalog label")).toHaveProperty(
			"value",
			"Shoes",
		);
		expect(view.queryByRole("textbox", { name: "Brand" })).toBeNull();
		expect(view.queryByLabelText("Page title")).toBeNull();
		expect(view.queryByRole("switch", { name: "Show header" })).toBeNull();
		expect(view.queryByRole("switch", { name: "Show footer" })).toBeNull();
		expect(view.getByRole("switch", { name: "Enable Brand" })).toHaveProperty(
			"checked",
			true,
		);
		expect(
			view.getByText(
				"Data is a snapshot refreshed on insert, not a live CMS connection.",
			),
		).toBeTruthy();
		expect(onChange).not.toHaveBeenCalled();
	});

	it("updates display settings immutably and retains nonstandard page sizes", function () {
		const config = makeConfig();
		const onChange = vi.fn();
		const view = render(
			<ListingSettings config={config} onChange={onChange} fields={fields} />,
		);
		fireEvent.change(view.getByLabelText("Catalog label"), {
			target: { value: "New arrivals" },
		});
		expect(onChange).toHaveBeenLastCalledWith({
			...config,
			title: "New arrivals",
		});
		fireEvent.change(view.getByLabelText("Currency"), {
			target: { value: "EUR" },
		});
		expect(onChange).toHaveBeenLastCalledWith({ ...config, currency: "EUR" });

		const picker = view.getByText("Products per page")
			.parentElement as HTMLElement;
		expect(within(picker).getAllByText("20")).toHaveLength(2);
		fireEvent.click(within(picker).getByText("24"));
		expect(onChange).toHaveBeenLastCalledWith({ ...config, pageSize: 24 });
		expect(config.title).toBe("Shoes");
		expect(config.currency).toBe("USD");
		expect(config.pageSize).toBe(20);
	});

	it("toggles multiple search columns with switches and stores CMS IDs", function () {
		const config = makeConfig();
		const onChange = vi.fn();
		const view = render(
			<ListingSettings config={config} onChange={onChange} fields={fields} />,
		);
		fireEvent.click(view.getByText("Search Fields"));
		fireEvent.click(view.getByRole("switch", { name: "CMS: Material" }));
		expect(onChange).toHaveBeenLastCalledWith({
			...config,
			searchFields: ["name", "description", "cms-material-42"],
		});
		fireEvent.click(view.getByRole("switch", { name: "Name" }));
		expect(onChange).toHaveBeenLastCalledWith({
			...config,
			searchFields: ["description"],
		});
		expect(config.searchFields).toEqual(["name", "description"]);
	});

	it("edits filter titles, kinds, and column IDs without changing other rows", function () {
		const config = makeConfig();
		const onChange = vi.fn();
		const view = render(
			<ListingSettings config={config} onChange={onChange} fields={fields} />,
		);
		const summary = view.getByText("Category", { selector: "summary" });
		fireEvent.click(summary);
		const editor = within(summary.parentElement as HTMLElement);
		fireEvent.change(editor.getByLabelText("Filter title"), {
			target: { value: "Material" },
		});
		expect(onChange.mock.lastCall?.[0].filters[0].label).toBe("Material");
		const columnPicker = editor.getByText("CMS column")
			.parentElement as HTMLElement;
		fireEvent.click(within(columnPicker).getByText("CMS: Material"));
		expect(onChange.mock.lastCall?.[0].filters[0].field).toBe(
			"cms-material-42",
		);
		const kindPicker = editor.getByText("Filter kind")
			.parentElement as HTMLElement;
		fireEvent.click(within(kindPicker).getByText("Color"));
		expect(onChange.mock.lastCall?.[0].filters[0].kind).toBe("color");
		expect(onChange.mock.lastCall?.[0].filters.slice(1)).toEqual(
			config.filters.slice(1),
		);
		fireEvent.click(view.getByRole("switch", { name: "Enable Category" }));
		expect(onChange.mock.lastCall?.[0].filters[0].enabled).toBe(false);
		expect(config.filters[0].enabled).toBe(true);
	});

	it("adds uniquely identified custom filters and removes them", function () {
		const config = makeConfig();
		config.filters.push({
			id: "custom-filter-1",
			label: "Existing",
			field: "name",
			kind: "options",
			enabled: false,
		});
		const onChange = vi.fn();
		const view = render(
			<ListingSettings config={config} onChange={onChange} fields={fields} />,
		);
		fireEvent.click(view.getByRole("button", { name: "Add custom filter" }));
		const next: ListingConfig = onChange.mock.lastCall?.[0];
		expect(next.filters[next.filters.length - 1]).toEqual({
			id: "custom-filter-2",
			label: "Custom filter",
			field: "cms-material-42",
			kind: "options",
			enabled: true,
		});
		view.rerender(
			<ListingSettings config={next} onChange={onChange} fields={fields} />,
		);
		fireEvent.click(view.getByText("Custom filter", { selector: "summary" }));
		fireEvent.click(view.getByRole("button", { name: "Remove Custom filter" }));
		expect(onChange).toHaveBeenLastCalledWith(config);
	});

	it("closes custom pickers with Escape and restores trigger focus", function () {
		const view = render(
			<ListingSettings
				config={makeConfig()}
				onChange={vi.fn()}
				fields={fields}
			/>,
		);
		const picker = view.getByText("Products per page")
			.parentElement as HTMLElement;
		const trigger = picker.querySelector("summary") as HTMLElement;
		const disclosure = picker.querySelector("details") as HTMLDetailsElement;
		fireEvent.click(trigger);
		expect(disclosure.open).toBe(true);
		fireEvent.keyDown(trigger, { key: "Escape" });
		expect(disclosure.open).toBe(false);
		expect(document.activeElement).toBe(trigger);
	});

	it("disables every editable control without preventing inspection", function () {
		const onChange = vi.fn();
		const view = render(
			<ListingSettings
				config={makeConfig()}
				onChange={onChange}
				fields={fields}
				disabled
			/>,
		);
		fireEvent.click(view.getByText("Search Fields"));
		for (const control of view.container.querySelectorAll<HTMLInputElement>(
			"input",
		)) {
			expect(control.disabled).toBe(true);
		}
		for (const trigger of view.container.querySelectorAll<HTMLElement>(
			'summary[aria-disabled="true"]',
		)) {
			fireEvent.click(trigger);
			expect((trigger.parentElement as HTMLDetailsElement).open).toBe(false);
		}
		fireEvent.click(view.getByRole("button", { name: "Add custom filter" }));
		fireEvent.change(view.getByLabelText("Catalog label"), {
			target: { value: "Ignored" },
		});
		expect(onChange).not.toHaveBeenCalled();
	});

	it("preserves missing CMS mappings and lets shoppers' search columns be removed", function () {
		const config = makeConfig();
		config.searchFields = ["removed-column"];
		config.filters[0].field = "removed-column";
		const onChange = vi.fn();
		const view = render(
			<ListingSettings config={config} onChange={onChange} fields={[]} />,
		);
		fireEvent.click(view.getByText("Search Fields"));
		fireEvent.click(view.getByRole("switch", { name: "Unavailable column" }));
		expect(onChange).toHaveBeenLastCalledWith({ ...config, searchFields: [] });
		expect(config.filters[0].field).toBe("removed-column");
	});
});
