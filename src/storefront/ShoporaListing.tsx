import * as React from "react";
import {
	filterProducts,
	formatMoney,
	getFilterOptions,
	safeLink,
	sortProducts,
	type ListingConfig,
	type ListingFilter,
	type ListingProduct,
	type ListingSelection,
} from "./listingModel";
import { SHOPORA_STYLES } from "./shoporaStyles";

type ShoporaIconName =
	| "search"
	| "heart"
	| "chevron"
	| "right"
	| "left"
	| "grid"
	| "list"
	| "close"
	| "filter"
	| "image";

function ShoporaIcon({
	name,
	className = "",
}: {
	name: ShoporaIconName;
	className?: string;
}) {
	const paths: Record<ShoporaIconName, React.ReactNode> = {
		search: (
			<>
				<circle cx="10.5" cy="10.5" r="6.5" />
				<path d="m16 16 4.5 4.5" />
			</>
		),
		heart: (
			<path d="M20.5 4.8a5.4 5.4 0 0 0-7.6 0l-.9.9-.9-.9a5.4 5.4 0 0 0-7.6 7.6L12 21l8.5-8.6a5.4 5.4 0 0 0 0-7.6Z" />
		),
		chevron: <path d="m6 9 6 6 6-6" />,
		right: <path d="m9 5 7 7-7 7" />,
		left: <path d="m15 5-7 7 7 7" />,
		grid: (
			<>
				<rect x="3" y="3" width="6" height="6" rx=".5" />
				<rect x="15" y="3" width="6" height="6" rx=".5" />
				<rect x="3" y="15" width="6" height="6" rx=".5" />
				<rect x="15" y="15" width="6" height="6" rx=".5" />
			</>
		),
		list: (
			<>
				<path d="M9 5h12M9 12h12M9 19h12" />
				<path d="M3 5h1M3 12h1M3 19h1" />
			</>
		),
		close: <path d="m6 6 12 12M18 6 6 18" />,
		filter: (
			<>
				<path d="M3 6h18M3 12h18M3 18h18" />
				<path d="M8 3v6M16 9v6M8 15v6" />
			</>
		),
		image: (
			<>
				<rect x="3" y="3" width="18" height="18" rx="2" />
				<circle cx="8" cy="8" r="1.5" />
				<path d="m21 15-5-5L5 21" />
			</>
		),

	};
	return (
		<svg
			className={`shopora-icon ${className}`}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			focusable="false"
		>
			{paths[name]}
		</svg>
	);
}

function ShoporaSearch({
	id,
	query,
	onQuery,
}: {
	id: string;
	query: string;
	onQuery: (query: string) => void;
}) {
	return (
		<div
			className="shopora-search"
			role="search"
			aria-label="Search the catalog"
		>
			<ShoporaIcon name="search" />
			<label className="shopora-sr-only" htmlFor={id}>
				Search products
			</label>
			<input
				id={id}
				type="search"
				value={query}
				placeholder="Search for products..."
				onChange={function (event) {
					onQuery(event.currentTarget.value);
				}}
			/>
			{query && (
				<button
					type="button"
					aria-label="Clear search"
					onClick={function () {
						onQuery("");
					}}
				>
					<ShoporaIcon name="close" />
				</button>
			)}
		</div>
	);
}

function ShoporaImage({
	product,
	eager = false,
}: {
	product: ListingProduct;
	eager?: boolean;
}) {
	const source = safeLink(product.imageUrl);
	const [failedSource, setFailedSource] = React.useState<string | null>(null);
	if (!source || failedSource === source) {
		return (
			<div
				className="shopora-image-fallback"
				role="img"
				aria-label={`Image unavailable for ${product.name}`}
			>
				<ShoporaIcon name="image" />
				<span>Image unavailable</span>
			</div>
		);
	}
	return (
		<img
			className="shopora-image"
			src={source}
			alt={product.name}
			loading={eager ? "eager" : "lazy"}
			decoding="async"
			onError={function () {
				setFailedSource(source);
			}}
		/>
	);
}

function ShoporaPrice({
	product,
	currency,
}: {
	product: ListingProduct;
	currency: string;
}) {
	const onSale =
		product.price !== null &&
		product.regularPrice !== null &&
		product.regularPrice > product.price;
	return (
		<span className="shopora-price">
			<span>
				{product.price === null
					? "Price on request"
					: formatMoney(product.price, currency)}
			</span>
			{onSale && (
				<del>
					<span className="shopora-sr-only">Regular price: </span>
					{formatMoney(product.regularPrice, currency)}
				</del>
			)}
		</span>
	);
}

function ShoporaRating({ product }: { product: ListingProduct }) {
	const rating =
		product.rating === null || !Number.isFinite(product.rating)
			? null
			: Math.min(5, Math.max(0, product.rating));
	const count =
		product.ratingCount === null || !Number.isFinite(product.ratingCount)
			? null
			: Math.max(0, Math.floor(product.ratingCount));
	if (rating === null)
		return <div className="shopora-rating">Not yet rated</div>;
	return (
		<div
			className="shopora-rating"
			aria-label={`${rating.toFixed(1)} out of 5 stars${count === null ? "" : `, ${count} ${count === 1 ? "review" : "reviews"}`}`}
		>
			<span className="shopora-stars" aria-hidden="true">
				★★★★★
				<span
					className="shopora-stars-fill"
					style={{ width: `${(rating / 5) * 100}%` }}
				>
					★★★★★
				</span>
			</span>
			{count !== null && <span aria-hidden="true">({count})</span>}
		</div>
	);
}

function shoporaSwatchName(value: string): string {
	const name = value.toLowerCase().trim().replace(/grey/g, "gray");
	const known = [
		"black",
		"white",
		"red",
		"blue",
		"green",
		"yellow",
		"orange",
		"purple",
		"pink",
		"brown",
		"beige",
		"gray",
		"navy",
		"silver",
		"gold",
	];
	return known.includes(name) ? name : "other";
}

function ShoporaFilterSection({
	filter,
	products,
	availableProducts,
	selected,
	currency,
	instanceId,
	onSelection,
}: {
	filter: ListingFilter;
	products: ListingProduct[];
	availableProducts: ListingProduct[];
	selected: string[];
	currency: string;
	instanceId: string;
	onSelection: (id: string, values: string[]) => void;
}) {
	const [expanded, setExpanded] = React.useState(false);
	const options = getFilterOptions(products, filter, currency);
	const countConfig: ListingConfig = {
		title: "",
		currency,
		pageSize: 20,
		searchFields: [],
		filters: [filter],
	};
	// Reusing the original values keeps price bucket boundaries stable as other facets change.
	const counts = new Map(
		options.map(function (option) {
			return [
				option.value,
				filterProducts(availableProducts, countConfig, "", {
					[filter.id]: [option.value],
				}).length,
			];
		}),
	);
	const radio = filter.kind === "rating";
	// Keep selected options visible even when they fall below the collapsed list.
	const visibleOptions = options.filter(function (option, index) {
		return expanded || index < 6 || selected.includes(option.value);
	});
	return (
		<details className="shopora-filter" open>
			<summary>
				{filter.label}
				<ShoporaIcon name="chevron" />
			</summary>
			<div
				className="shopora-filter-options"
				role="group"
				aria-label={filter.label}
			>
				{radio && (
					<label className="shopora-option">
						<input
							type="radio"
							name={`${instanceId}-${filter.id}`}
							checked={selected.length === 0}
							onChange={function () {
								onSelection(filter.id, []);
							}}
						/>
						<span className="shopora-option-label">All</span>
						<span className="shopora-option-count">
							({availableProducts.length})
						</span>
					</label>
				)}
				{visibleOptions.map(function (option) {
					const checked = selected.includes(option.value);
					return (
						<label className="shopora-option" key={option.value}>
							<input
								type={radio ? "radio" : "checkbox"}
								name={`${instanceId}-${filter.id}`}
								value={option.value}
								checked={checked}
								onChange={function () {
									onSelection(
										filter.id,
										radio
											? [option.value]
											: checked
												? selected.filter(function (value) {
														return value !== option.value;
													})
												: [...selected, option.value],
									);
								}}
							/>
							{filter.kind === "color" && (
								<span
									className="shopora-swatch"
									data-color={shoporaSwatchName(option.value)}
									aria-hidden="true"
								>
									{shoporaSwatchName(option.value) === "other"
										? option.label.charAt(0)
										: ""}
								</span>
							)}
							{filter.kind === "rating" ? (
								<span className="shopora-stars" aria-hidden="true">
									★★★★★
									<span
										className="shopora-stars-fill"
										style={{ width: `${(Number(option.value) / 5) * 100}%` }}
									>
										★★★★★
									</span>
								</span>
							) : null}
							<span className="shopora-option-label">{option.label}</span>
							<span className="shopora-option-count">
								({counts.get(option.value) ?? 0})
							</span>
						</label>
					);
				})}
				{options.length === 0 && (
					<p className="shopora-unavailable">No options available.</p>
				)}
			</div>
			{(options.length > visibleOptions.length ||
				(expanded && options.length > 6)) && (
				<button
					className="shopora-show-more"
					type="button"
					aria-expanded={expanded}
					onClick={function () {
						setExpanded(!expanded);
					}}
				>
					{expanded
						? "Show less"
						: `Show more (${options.length - visibleOptions.length})`}
				</button>
			)}
		</details>
	);
}

function ShoporaProductCard({
	product,
	currency,
	saved,
	onSave,
	onQuickView,
}: {
	product: ListingProduct;
	currency: string;
	saved: boolean;
	onSave: (id: string) => void;
	onQuickView: (product: ListingProduct, trigger: HTMLButtonElement) => void;
}) {
	const href = safeLink(product.permalink);
	return (
		<article className="shopora-product" aria-label={product.name}>
			<div className="shopora-product-image">
				{href ? (
					<a
						className="shopora-image-link"
						href={href}
						tabIndex={-1}
						aria-hidden="true"
					>
						<ShoporaImage product={product} />
					</a>
				) : (
					<div className="shopora-image-link">
						<ShoporaImage product={product} />
					</div>
				)}
				<button
					className="shopora-heart"
					type="button"
					aria-label={`${saved ? "Remove" : "Save"} ${product.name}${saved ? " from" : " to"} wishlist`}
					aria-pressed={saved}
					onClick={function () {
						onSave(product.id);
					}}
				>
					<ShoporaIcon name="heart" />
				</button>
				<button
					className="shopora-quick-view"
					type="button"
					aria-label={`Quick view ${product.name}`}
					aria-haspopup="dialog"
					onClick={function (event) {
						onQuickView(product, event.currentTarget);
					}}
				>
					Quick view
				</button>
			</div>
			<div className="shopora-product-copy">
				<div className="shopora-product-heading">
					<h3>{href ? <a href={href}>{product.name}</a> : product.name}</h3>
					<ShoporaPrice product={product} currency={currency} />
				</div>
				{product.description && (
					<p className="shopora-description">{product.description}</p>
				)}
				<ShoporaRating product={product} />
			</div>
		</article>
	);
}

function ShoporaQuickView({
	product,
	currency,
	saved,
	trigger,
	fallbackFocus,
	onSave,
	onClose,
	instanceId,
}: {
	product: ListingProduct;
	currency: string;
	saved: boolean;
	trigger: HTMLButtonElement | null;
	fallbackFocus: React.RefObject<HTMLDivElement>;
	onSave: (id: string) => void;
	onClose: () => void;
	instanceId: string;
}) {
	const dialogRef = React.useRef<HTMLDialogElement>(null);
	const closeRef = React.useRef<HTMLButtonElement>(null);
	const href = safeLink(product.permalink);
	React.useEffect(
		function () {
			const dialog = dialogRef.current;
			const fallback = fallbackFocus.current;
			if (!dialog) return;
			// The native modal supplies top-layer rendering, focus trapping, and inert surroundings.
			dialog.showModal();
			closeRef.current?.focus();
			return function () {
				dialog.close();
				if (trigger?.isConnected) trigger.focus({ preventScroll: true });
				else if (fallback?.isConnected) fallback.focus({ preventScroll: true });
			};
		},
		[trigger, fallbackFocus],
	);

	return (
		<dialog
			className="shopora-dialog"
			ref={dialogRef}
			aria-labelledby={`${instanceId}-quick-title`}
			aria-describedby={
				product.description ? `${instanceId}-quick-description` : undefined
			}
			onCancel={function (event) {
				event.preventDefault();
				onClose();
			}}
			onClose={function (event) {
				if (!event.currentTarget.open) onClose();
			}}
			onClick={function (event) {
				if (event.target !== event.currentTarget) return;
				const bounds = event.currentTarget.getBoundingClientRect();
				if (
					event.clientX < bounds.left ||
					event.clientX > bounds.right ||
					event.clientY < bounds.top ||
					event.clientY > bounds.bottom
				)
					onClose();
			}}
		>
			<div className="shopora-dialog-content">
				<button
					className="shopora-dialog-close"
					type="button"
					ref={closeRef}
					aria-label="Close quick view"
					onClick={onClose}
				>
					<ShoporaIcon name="close" />
				</button>
				<div className="shopora-dialog-image">
					<ShoporaImage product={product} eager />
				</div>
				<div className="shopora-dialog-copy">
					<h2 id={`${instanceId}-quick-title`}>{product.name}</h2>
					<ShoporaPrice product={product} currency={currency} />
					<ShoporaRating product={product} />
					{product.description && (
						<p id={`${instanceId}-quick-description`}>{product.description}</p>
					)}
					<div className="shopora-dialog-actions">
						{href ? (
							<a className="shopora-primary" href={href}>
								View product
								<ShoporaIcon name="right" />
							</a>
						) : (
							<span className="shopora-unavailable">
								Product link unavailable.
							</span>
						)}
						<button
							className="shopora-dialog-save"
							type="button"
							aria-pressed={saved}
							onClick={function () {
								onSave(product.id);
							}}
						>
							<ShoporaIcon name="heart" />
							{saved ? "Saved to wishlist" : "Save to wishlist"}
						</button>
					</div>
				</div>
			</div>
		</dialog>
	);
}

function shoporaPageNumbers(page: number, total: number): (number | string)[] {
	if (total <= 7)
		return Array.from({ length: total }, function (_, index) {
			return index + 1;
		});
	const pages = [1, total, page - 1, page, page + 1];
	if (page <= 3) pages.push(2, 3, 4);
	if (page >= total - 2) pages.push(total - 3, total - 2, total - 1);
	const unique = [...new Set(pages)]
		.filter(function (value) {
			return value >= 1 && value <= total;
		})
		.sort(function (a, b) {
			return a - b;
		});
	const result: (number | string)[] = [];
	unique.forEach(function (value, index) {
		if (index && value - unique[index - 1] > 1) result.push(`gap-${value}`);
		result.push(value);
	});
	return result;
}

export function ShoporaListing({
	products,
	config,
	style,
}: {
	products: ListingProduct[];
	config: ListingConfig;
	style?: React.CSSProperties;
}) {
	const instanceId = React.useId();
	const [query, setQuery] = React.useState("");
	const [selection, setSelection] = React.useState<ListingSelection>({});
	const [sort, setSort] = React.useState("popular");
	const [view, setView] = React.useState<"grid" | "list">("grid");
	const [page, setPage] = React.useState(1);
	const [savedIds, setSavedIds] = React.useState<Set<string>>(function () {
		return new Set();
	});
	const [wishlistOnly, setWishlistOnly] = React.useState(false);
	const [filtersOpen, setFiltersOpen] = React.useState(false);
	const [quickView, setQuickView] = React.useState<{
		id: string;
		trigger: HTMLButtonElement;
	} | null>(null);
	const resultsRef = React.useRef<HTMLDivElement>(null);
	const title = config.title || "Man’s Wears";
	const enabledFilters = config.filters.filter(function (filter) {
		return filter.enabled;
	});
	const activeSelection: ListingSelection = {};
	enabledFilters.forEach(function (filter) {
		if (selection[filter.id]?.length)
			activeSelection[filter.id] = selection[filter.id];
	});
	const catalog = wishlistOnly
		? products.filter(function (product) {
				return savedIds.has(product.id);
			})
		: products;
	const filtered = sortProducts(
		filterProducts(catalog, config, query, activeSelection),
		sort,
	);
	const pageSize =
		Number.isFinite(config.pageSize) && config.pageSize > 0
			? Math.max(1, Math.floor(config.pageSize))
			: 20;
	const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
	const currentPage = Math.min(page, totalPages);
	const pageProducts = filtered.slice(
		(currentPage - 1) * pageSize,
		currentPage * pageSize,
	);
	const firstResult = filtered.length ? (currentPage - 1) * pageSize + 1 : 0;
	const lastResult = Math.min(currentPage * pageSize, filtered.length);
	const savedCount = products.filter(function (product) {
		return savedIds.has(product.id);
	}).length;
	const quickProduct = quickView
		? products.find(function (product) {
				return product.id === quickView.id;
			})
		: undefined;
	const hasSelection = Object.keys(activeSelection).length > 0;
	const activeChips = enabledFilters.flatMap(function (filter) {
		const options = getFilterOptions(products, filter, config.currency);
		return (activeSelection[filter.id] || []).map(function (value) {
			return {
				id: filter.id,
				value,
				label: `${filter.label}: ${
					options.find(function (option) {
						return option.value === value;
					})?.label || value
				}`,
			};
		});
	});

	React.useEffect(
		function () {
			setPage(function (previous) {
				return Math.min(previous, totalPages);
			});
		},
		[totalPages],
	);
	React.useEffect(
		function () {
			if (quickView && !quickProduct) setQuickView(null);
		},
		[quickView, quickProduct],
	);

	function changeQuery(value: string) {
		setQuery(value);
		setPage(1);
	}
	function changeSelection(id: string, values: string[]) {
		setSelection(function (previous) {
			const next = { ...previous };
			if (values.length) next[id] = values;
			else delete next[id];
			return next;
		});
		setPage(1);
	}
	function clearAll() {
		setQuery("");
		setSelection({});
		setWishlistOnly(false);
		setPage(1);
	}
	function toggleWishlist() {
		setWishlistOnly(function (previous) {
			return !previous;
		});
		setPage(1);
	}
	function toggleSaved(id: string) {
		setSavedIds(function (previous) {
			const next = new Set(previous);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
		if (wishlistOnly) setPage(1);
	}
	function openQuickView(product: ListingProduct, trigger: HTMLButtonElement) {
		setQuickView({ id: product.id, trigger });
	}
	function closeQuickView() {
		setQuickView(null);
	}
	function changePage(value: number) {
		setPage(Math.max(1, Math.min(totalPages, value)));
		resultsRef.current?.focus({ preventScroll: true });
		resultsRef.current?.scrollIntoView?.({ behavior: "auto", block: "start" });
	}


	return (
		<div className="shopora-storefront" style={style}>
			{/* Static CSS must stay unescaped during SSR so quoted selectors and font names remain valid. */}
			<style dangerouslySetInnerHTML={{ __html: SHOPORA_STYLES }} />
			<div
				className="shopora-shell shopora-catalog"
				data-has-filters={enabledFilters.length > 0}
			>
				{enabledFilters.length > 0 && (
					<>
						<button
							className="shopora-mobile-filter shopora-mobile-filter-top"
							type="button"
							aria-expanded={filtersOpen}
							aria-controls={`${instanceId}-filters`}
							onClick={function () {
								setFiltersOpen(!filtersOpen);
							}}
						>
							<ShoporaIcon name="filter" />
							{filtersOpen ? "Hide filters" : "Show filters"}
							{hasSelection && (
								<span className="shopora-badge">{activeChips.length}</span>
							)}
						</button>
						<aside
							className="shopora-sidebar"
							id={`${instanceId}-filters`}
							data-open={filtersOpen}
							aria-label="Product filters"
						>
							<div className="shopora-sidebar-title">
								<div>
									<h2>FILTERS</h2>
									<p className="shopora-filter-total">
										{filtered.length.toLocaleString()}{" "}
										{filtered.length === 1 ? "product" : "products"}
									</p>
								</div>
								<button
									className="shopora-text-button"
									type="button"
									onClick={clearAll}
								>
									Clear all
								</button>
							</div>
							{enabledFilters.map(function (filter) {
								const otherSelection = { ...activeSelection };
								delete otherSelection[filter.id];
								const availableProducts = filterProducts(
									catalog,
									config,
									query,
									otherSelection,
								);
								return (
									<ShoporaFilterSection
										key={filter.id}
										filter={filter}
										products={products}
										availableProducts={availableProducts}
										selected={activeSelection[filter.id] || []}
										currency={config.currency}
										instanceId={instanceId}
										onSelection={changeSelection}
									/>
								);
							})}
						</aside>
					</>
				)}
				<main className="shopora-results" aria-label={`${title} catalog`}>
					<div className="shopora-catalog-search">
						<ShoporaSearch id={`${instanceId}-search`} query={query} onQuery={changeQuery} />
					</div>
					<div className="shopora-toolbar" ref={resultsRef} tabIndex={-1}>
						<p
							className="shopora-result-count"
							role="status"
							aria-live="polite"
							aria-atomic="true"
						>
							Showing{" "}
							<strong>
								{firstResult}
								{lastResult !== firstResult ? ` to ${lastResult}` : ""}
							</strong>{" "}
							of <strong>{filtered.length}</strong>{" "}
							{filtered.length === 1 ? "result" : "results"}
						</p>
						<div className="shopora-toolbar-controls">
							<button
								className="shopora-action"
								type="button"
								aria-label={`Wishlist, ${savedCount} saved ${savedCount === 1 ? "product" : "products"}`}
								aria-pressed={wishlistOnly}
								onClick={toggleWishlist}
							>
								<ShoporaIcon name="heart" />
								<span className="shopora-badge">{savedCount}</span>
							</button>
							<label className="shopora-sort">
								Sort by:
								<select
									value={sort}
									onChange={function (event) {
										setSort(event.currentTarget.value);
										setPage(1);
									}}
								>
									<option value="popular">Popularity</option>
									<option value="price-asc">Price: low to high</option>
									<option value="price-desc">Price: high to low</option>
									<option value="rating">Top rated</option>
									<option value="name">Name: A to Z</option>
								</select>
							</label>
							<div
								className="shopora-view-toggle"
								role="group"
								aria-label="Product view"
							>
								<button
									type="button"
									aria-label="Grid view"
									aria-pressed={view === "grid"}
									onClick={function () {
										setView("grid");
									}}
								>
									<ShoporaIcon name="grid" />
								</button>
								<button
									type="button"
									aria-label="List view"
									aria-pressed={view === "list"}
									onClick={function () {
										setView("list");
									}}
								>
									<ShoporaIcon name="list" />
								</button>
							</div>
						</div>
					</div>
					{(query || hasSelection || wishlistOnly) && (
						<div className="shopora-active-filters" aria-label="Active filters">
							{query && (
								<button
									className="shopora-chip"
									type="button"
									aria-label={`Remove search: ${query}`}
									onClick={function () {
										changeQuery("");
									}}
								>
									Search: {query}
									<ShoporaIcon name="close" />
								</button>
							)}
							{wishlistOnly && (
								<button
									className="shopora-chip"
									type="button"
									onClick={toggleWishlist}
								>
									Saved products
									<ShoporaIcon name="close" />
								</button>
							)}
							{activeChips.map(function (chip) {
								return (
									<button
										className="shopora-chip"
										type="button"
										key={`${chip.id}-${chip.value}`}
										aria-label={`Remove ${chip.label}`}
										onClick={function () {
											changeSelection(
												chip.id,
												activeSelection[chip.id].filter(function (value) {
													return value !== chip.value;
												}),
											);
										}}
									>
										{chip.label}
										<ShoporaIcon name="close" />
									</button>
								);
							})}
							<button
								className="shopora-text-button"
								type="button"
								onClick={clearAll}
							>
								Clear all
							</button>
						</div>
					)}
					{pageProducts.length ? (
						<div className="shopora-product-grid" data-view={view}>
							{pageProducts.map(function (product) {
								return (
									<ShoporaProductCard
										key={product.id}
										product={product}
										currency={config.currency}
										saved={savedIds.has(product.id)}
										onSave={toggleSaved}
										onQuickView={openQuickView}
									/>
								);
							})}
						</div>
					) : (
						<div className="shopora-empty">
							<ShoporaIcon name={wishlistOnly ? "heart" : "search"} />
							<h2>
								{wishlistOnly && savedCount === 0
									? "Your Wishlist Is Empty"
									: "No Products Found"}
							</h2>
							<p>
								{wishlistOnly && savedCount === 0
									? "Save your favorite products with the heart icon, then find them here."
									: products.length === 0
										? "The collection is being updated. Please check back soon."
										: "Try a different search or clear your filters to see more products."}
							</p>
							{(query || hasSelection || wishlistOnly) && (
								<button
									className="shopora-primary"
									type="button"
									onClick={clearAll}
								>
									View all products
								</button>
							)}
						</div>
					)}
					{totalPages > 1 && (
						<nav className="shopora-pagination" aria-label="Catalog pages">
							<button
								type="button"
								aria-label="Previous page"
								disabled={currentPage === 1}
								onClick={function () {
									changePage(currentPage - 1);
								}}
							>
								<ShoporaIcon name="left" />
							</button>
							{shoporaPageNumbers(currentPage, totalPages).map(
								function (value) {
									return typeof value === "string" ? (
										<span
											className="shopora-page-gap"
											key={value}
											aria-hidden="true"
										>
											…
										</span>
									) : (
										<button
											type="button"
											key={value}
											aria-label={`Page ${value}`}
											aria-current={value === currentPage ? "page" : undefined}
											onClick={function () {
												changePage(value);
											}}
										>
											{value}
										</button>
									);
								},
							)}
							<button
								type="button"
								aria-label="Next page"
								disabled={currentPage === totalPages}
								onClick={function () {
									changePage(currentPage + 1);
								}}
							>
								<ShoporaIcon name="right" />
							</button>
						</nav>
					)}
				</main>
			</div>
			{quickView && quickProduct && (
				<ShoporaQuickView
					product={quickProduct}
					currency={config.currency}
					saved={savedIds.has(quickProduct.id)}
					trigger={quickView.trigger}
					fallbackFocus={resultsRef}
					onSave={toggleSaved}
					onClose={closeQuickView}
					instanceId={instanceId}
				/>
			)}
		</div>
	);
}
