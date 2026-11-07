import { framer } from "../lib/framer";
import modelSource from "./listingModel.ts?raw";
import componentSource from "./ShoporaListing.tsx?raw";
import stylesSource from "./shoporaStyles.ts?raw";
import type { ListingConfig, ListingProduct } from "./listingModel";

interface CatalogColumn {
	id: string;
	name: string;
}

/** Build an independent Framer component; local imports never leak into the project. */
export function buildListingSource(
	products: ListingProduct[],
	config: ListingConfig,
	columns: CatalogColumn[],
): string {
	const runtime = componentSource
		.replace(/import\s*\{[\s\S]*?\}\s*from\s*["']\.\/listingModel["'];?/, "")
		.replace(
			/import\s*\{\s*SHOPORA_STYLES\s*\}\s*from\s*["']\.\/shoporaStyles["'];?/,
			"",
		)
		.replace(/export function ShoporaListing/, "function ShoporaListing");
	const values = JSON.stringify({ products, config });
	const fields = [
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
	const labels = [
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
	const fieldControl = JSON.stringify({
		type: "enum",
		options: fields,
		optionTitles: labels,
	});
	return `import { addPropertyControls, ControlType } from "framer"\n${modelSource.replace(/export /g, "")}\n${stylesSource.replace(/export /g, "")}\n${runtime}\n
const catalogSnapshot: { products: ListingProduct[]; config: ListingConfig } = ${values}
/**
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight auto
 * @framerIntrinsicWidth 1280
 * @framerIntrinsicHeight 2900
 */
export default function EcomLinkCatalog(props: Partial<ListingConfig> & { style?: React.CSSProperties }) {
  const config: ListingConfig = { ...catalogSnapshot.config, ...props }
  // Inline-size containment cannot supply an intrinsic width during Framer's auto measurement.
  const rootStyle: React.CSSProperties = {
    minWidth: 0,
    flexShrink: 0,
    ...props.style,
    width: props.style?.width === undefined || props.style.width === "auto" ? 1280 : props.style.width,
  }
  return <ShoporaListing products={catalogSnapshot.products} config={config} style={rootStyle} />
}
addPropertyControls(EcomLinkCatalog, {
  title: { type: ControlType.String, title: "Catalog label", defaultValue: catalogSnapshot.config.title },
  currency: { type: ControlType.String, title: "Currency", defaultValue: catalogSnapshot.config.currency },
  pageSize: { type: ControlType.Number, title: "Per page", min: 1, max: 100, step: 1, defaultValue: catalogSnapshot.config.pageSize },

  searchFields: { type: ControlType.Array, title: "Search columns", control: ${fieldControl}, defaultValue: catalogSnapshot.config.searchFields },
  filters: { type: ControlType.Array, title: "Sidebar filters", defaultValue: catalogSnapshot.config.filters, control: {
    type: ControlType.Object, controls: {
      id: { type: ControlType.String, title: "Unique ID", description: "Use a different ID for each filter." },
      label: { type: ControlType.String, title: "Label" },
      enabled: { type: ControlType.Boolean, title: "Enabled", defaultValue: true },
      field: { ...${fieldControl}, title: "CMS column" },
      kind: { type: ControlType.Enum, title: "Display", options: ["options", "rating", "price", "color", "discount"], optionTitles: ["Checkboxes", "Rating", "Price range", "Color", "Discount"] }
    }
  } }
})\n`;
}

/** New inserts never overwrite a merchant's existing code or canvas layers. */
export async function insertInteractiveListing(
	products: ListingProduct[],
	config: ListingConfig,
	columns: CatalogColumn[],
): Promise<void> {
	if (
		typeof framer.createCodeFile !== "function" ||
		typeof framer.addComponentInstance !== "function"
	) {
		throw new Error(
			"This Framer build cannot insert interactive catalogs. Update Framer, reopen the plugin, and try again.",
		);
	}
	for (const method of ["createCodeFile", "addComponentInstance"] as const) {
		if (framer.isAllowedTo(method) === false)
			throw new Error(
				"You need code and canvas edit access to insert this catalog. Open this project with an editor account.",
			);
	}
	const file = await framer.createCodeFile(
		"EcomLinkCatalog",
		buildListingSource(products, config, columns),
	);
	let inserted = false;
	try {
		let compiled = file;
		for (let attempt = 0; attempt <= 10; attempt++) {
			const component = compiled.exports.find(function catalogExport(entry) {
				return entry.type === "component" && entry.isDefaultExport;
			});
			if (component && component.type === "component") {
				await framer.addComponentInstance({
					url: component.insertURL,
					attributes: {
						name: "Shopora Catalog",
						width: "1280px",
						height: "fit-content",
					},
				});
				inserted = true;
				return;
			}
			if (attempt === 10) break;
			await new Promise(function wait(resolve) {
				setTimeout(resolve, 500);
			});
			compiled = (await framer.getCodeFile(file.id)) ?? file;
		}
		throw new Error(
			"Framer could not compile the catalog in time. Reopen the plugin and try again.",
		);
	} finally {
		if (!inserted && framer.isAllowedTo("CodeFile.remove"))
			await file.remove().catch(function ignoreCleanup() {});
	}
}
