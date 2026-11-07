import { useId, useRef } from "react";
import type {
	ListingConfig,
	ListingFilter,
} from "../../storefront/listingModel";
import { Field } from "../ui/Field";
import { HelpTooltip } from "../ui/HelpTooltip";
import { Switch } from "../ui/Switch";
import styles from "../../assets/styles/module/ListingSettings.module.css";

interface ListingSettingsProps {
	config: ListingConfig;
	onChange: (config: ListingConfig) => void;
	fields: Array<{ id: string; name: string; type?: string }>;
	disabled?: boolean;
}

interface Option {
	value: string;
	label: string;
}

const BUILT_IN_FIELDS: Option[] = [
	{ value: "name", label: "Name" },
	{ value: "description", label: "Description" },
	{ value: "price", label: "Price" },
	{ value: "regularPrice", label: "Regular price" },
	{ value: "rating", label: "Rating" },
	{ value: "category", label: "Category" },
	{ value: "brand", label: "Brand" },
	{ value: "color", label: "Color" },
	{ value: "discount", label: "Discount" },
];

const FILTER_KINDS: Array<{ value: ListingFilter["kind"]; label: string }> = [
	{ value: "options", label: "Options" },
	{ value: "rating", label: "Rating" },
	{ value: "price", label: "Price range" },
	{ value: "color", label: "Color" },
	{ value: "discount", label: "Discount" },
];

/** Native disclosure semantics keep the custom picker usable without an OS select. */
function SettingsPicker({
	label,
	value,
	options,
	onChange,
	disabled,
}: {
	label: string;
	value: string;
	options: Option[];
	onChange: (value: string) => void;
	disabled: boolean;
}) {
	const id = useId();
	const disclosure = useRef<HTMLDetailsElement>(null);
	const trigger = useRef<HTMLElement>(null);
	const selected = options.find(function match(option) {
		return option.value === value;
	});

	return (
		<div className={styles.pickerField}>
			<span id={`${id}-label`} className={styles.label}>
				{label}
			</span>
			<details
				ref={disclosure}
				className={styles.picker}
				onBlur={function closeOnBlur(event) {
					if (!event.currentTarget.contains(event.relatedTarget)) {
						event.currentTarget.open = false;
					}
				}}
				onKeyDown={function closeOnEscape(event) {
					if (event.key === "Escape") {
						event.preventDefault();
						event.stopPropagation();
						event.currentTarget.open = false;
						trigger.current?.focus();
					}
				}}
			>
				<summary
					ref={trigger}
					className={styles.pickerTrigger}
					aria-labelledby={`${id}-label ${id}-value`}
					aria-disabled={disabled}
					tabIndex={disabled ? -1 : 0}
					onClick={function preventDisabledOpen(event) {
						if (disabled) event.preventDefault();
					}}
				>
					<span id={`${id}-value`}>
						{selected?.label ?? "Unavailable column"}
					</span>
					<span className={styles.chevron} aria-hidden="true">
						⌄
					</span>
				</summary>
				{!disabled ? (
					<div
						className={styles.pickerOptions}
						role="group"
						aria-labelledby={`${id}-label`}
					>
						{options.map(function renderOption(option) {
							return (
								<button
									type="button"
									key={option.value}
									className={styles.option}
									aria-current={option.value === value ? "true" : undefined}
									onClick={function chooseOption() {
										onChange(option.value);
										if (disclosure.current) disclosure.current.open = false;
										trigger.current?.focus();
									}}
								>
									<span>{option.label}</span>
									{option.value === value ? (
										<span aria-hidden="true">✓</span>
									) : null}
								</button>
							);
						})}
					</div>
				) : null}
			</details>
		</div>
	);
}

/** Controlled, inline configuration only; the parent owns defaults and insertion. */
export function ListingSettings({
	config,
	onChange,
	fields,
	disabled = false,
}: ListingSettingsProps) {
	const id = useId();
	const columnMap = new Map<string, Option>();
	for (const option of BUILT_IN_FIELDS) columnMap.set(option.value, option);
	for (const field of fields) {
		columnMap.set(field.id, { value: field.id, label: `CMS: ${field.name}` });
	}
	const columns = Array.from(columnMap.values());
	const searchColumns = [...columns];
	for (const field of config.searchFields) {
		if (!columnMap.has(field)) {
			searchColumns.push({ value: field, label: "Unavailable column" });
		}
	}
	const pageSizes = Array.from(
		new Set([6, 12, 20, 24, 36, 48, 60, 96, config.pageSize]),
	)
		.sort(function ascending(a, b) {
			return a - b;
		})
		.map(function pageSizeOption(size) {
			return { value: String(size), label: String(size) };
		});

	function update(patch: Partial<ListingConfig>) {
		if (!disabled) onChange({ ...config, ...patch });
	}

	function updateFilter(filterId: string, patch: Partial<ListingFilter>) {
		update({
			filters: config.filters.map(function replaceFilter(filter) {
				return filter.id === filterId ? { ...filter, ...patch } : filter;
			}),
		});
	}

	function addFilter() {
		// Check existing IDs so saved custom rows never collide with a newly added row.
		let suffix = 1;
		while (
			config.filters.some(function hasId(filter) {
				return filter.id === `custom-filter-${suffix}`;
			})
		) {
			suffix += 1;
		}
		update({
			filters: [
				...config.filters,
				{
					id: `custom-filter-${suffix}`,
					label: "Custom filter",
					field: fields[0]?.id ?? "category",
					kind: "options",
					enabled: true,
				},
			],
		});
	}

	return (
		<section className={styles.panel} aria-labelledby={`${id}-heading`}>
			<div className={styles.headingRow}>
				<h3 id={`${id}-heading`} className={styles.heading}>
					Listing Settings
				</h3>
				<HelpTooltip
					label="About listing settings"
					text="Choose how your listing looks and which columns shoppers can search or filter. CMS column selections are saved by their unique ID, so renaming a column keeps its mapping."
				/>
			</div>
			<p className={styles.note}>
				Data is a snapshot refreshed on insert, not a live CMS connection.
			</p>

			<details className={styles.group} open>
				<summary className={styles.groupTitle}>Display Settings</summary>
				<div className={styles.groupBody}>
					<Field
						id={`${id}-title`}
						label="Catalog label"
						value={config.title}
						disabled={disabled}
						onChange={function changeTitle(title) {
							update({ title });
						}}
					/>
					<div className={styles.twoColumns}>
						<Field
							id={`${id}-currency`}
							label="Currency"
							value={config.currency}
							disabled={disabled}
							placeholder="USD"
							onChange={function changeCurrency(currency) {
								update({ currency });
							}}
						/>
						<SettingsPicker
							label="Products per page"
							value={String(config.pageSize)}
							options={pageSizes}
							disabled={disabled}
							onChange={function changePageSize(value) {
								update({ pageSize: Number(value) });
							}}
						/>
					</div>
				</div>
			</details>

			<details className={styles.group}>
				<summary className={styles.groupTitle}>Search Fields</summary>
				<div className={styles.groupBody}>
					<div className={styles.headingRow}>
						<span className={styles.label}>Searchable columns</span>
						<HelpTooltip
							label="About search fields"
							text="Enable each column shoppers can search. Choose built-in product fields or columns from your collection."
						/>
					</div>
					{searchColumns.map(function renderSearchField(column) {
						return (
							<div className={styles.searchRow} key={column.value}>
								<Switch
									label={column.label}
									checked={config.searchFields.includes(column.value)}
									disabled={disabled}
									onChange={function toggleSearchField(checked) {
										const remaining = config.searchFields.filter(
											function otherField(field) {
												return field !== column.value;
											},
										);
										update({
											searchFields: checked
												? [...remaining, column.value]
												: remaining,
										});
									}}
								/>
							</div>
						);
					})}
				</div>
			</details>

			<details className={styles.group} open>
				<summary className={styles.groupTitle}>Filters</summary>
				<div className={styles.groupBody}>
					<div className={styles.headingRow}>
						<span className={styles.label}>Filter columns</span>
						<HelpTooltip
							label="About filter columns"
							text="Edit a filter's title, style, and source column. Turn it off to hide it without losing its settings, or add a custom filter for another CMS column."
						/>
					</div>
					{config.filters.map(function renderFilter(filter, index) {
						return (
							<div key={filter.id} className={styles.filterRow}>
								<details className={styles.filterEditor}>
									<summary className={styles.filterTitle}>
										{filter.label || "Untitled Filter"}
									</summary>
									<div className={styles.filterBody}>
										<Field
											id={`${id}-filter-${index}`}
											label="Filter title"
											value={filter.label}
											disabled={disabled}
											onChange={function changeLabel(label) {
												updateFilter(filter.id, { label });
											}}
										/>
										<SettingsPicker
											label="Filter kind"
											value={filter.kind}
											options={FILTER_KINDS}
											disabled={disabled}
											onChange={function changeKind(value) {
												const kind = FILTER_KINDS.find(
													function matchKind(option) {
														return option.value === value;
													},
												);
												if (kind) updateFilter(filter.id, { kind: kind.value });
											}}
										/>
										<SettingsPicker
											label="CMS column"
											value={filter.field}
											options={columns}
											disabled={disabled}
											onChange={function changeColumn(field) {
												updateFilter(filter.id, { field });
											}}
										/>
										<button
											type="button"
											className={styles.removeButton}
											disabled={disabled}
											aria-label={`Remove ${filter.label || "untitled filter"}`}
											onClick={function removeFilter() {
												update({
													filters: config.filters.filter(
														function keepFilter(item) {
															return item.id !== filter.id;
														},
													),
												});
											}}
										>
											Remove filter
										</button>
									</div>
								</details>
								<div className={styles.filterSwitch}>
									<Switch
										ariaLabel={`Enable ${filter.label || "untitled filter"}`}
										checked={filter.enabled}
										disabled={disabled}
										onChange={function changeEnabled(enabled) {
											updateFilter(filter.id, { enabled });
										}}
									/>
								</div>
							</div>
						);
					})}
					{config.filters.length === 0 ? (
						<p className={styles.note}>
							Add a filter to help shoppers narrow the listing.
						</p>
					) : null}
					<button
						type="button"
						className={styles.addButton}
						disabled={disabled}
						onClick={addFilter}
					>
						Add custom filter
					</button>
				</div>
			</details>
		</section>
	);
}
