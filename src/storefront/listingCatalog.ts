/** Plugin-side snapshot loader. Only the returned public values belong in code files. */
import { getActiveConnection } from "../storage/connections";
import { INTERNAL_COLLECTION_NAME, sdk } from "../storage/internal";
import type {
	SdkCollectionLike,
	SdkFieldLike,
	SdkItemLike,
} from "../storage/internal";
import { getSyncSettings } from "../storage/settings";
import type { SyncSettings } from "../storage/settings";
import { htmlToText } from "../sync/engine";
import { demoListingProducts, numericValue, safeLink } from "./listingModel";
import type { ListingProduct } from "./listingModel";

interface CatalogField extends SdkFieldLike {
	collectionId?: string;
}

interface ListingCatalog {
	products: ListingProduct[];
	fields: SdkFieldLike[];
	collectionId: string | null;
	collectionName: string | null;
	placeholder: boolean;
}

type PublicValue = ListingProduct["fields"][string];
type Semantic = keyof typeof FIELD_NAMES;

const SNAPSHOT_LIMIT = 5000;
const FIELD_NAMES = {
	name: ["name", "title", "product name"],
	price: ["price"],
	regularPrice: ["regular price"],
	rating: ["rating", "average rating"],
	ratingCount: ["rating count", "review count"],
	description: ["description", "short description"],
	featuredImage: ["featured image", "image", "image url"],
	permalink: ["permalink", "url"],
	category: ["category", "categories"],
	brand: ["brand", "vendor"],
	color: ["color", "colour"],
	attributes: ["attributes", "attributes JSON"],
};

function normalized(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isPublicField(field: SdkFieldLike): boolean {
	// Defense in depth for credential-shaped columns accidentally added to a public CMS.
	const privateName =
		/consumerkey|consumersecret|apikey|apisecret|accesstoken|refreshtoken|authorization|password|credential|secret/;
	return ![field.id, field.name].some(function sensitive(value) {
		const name = normalized(value);
		return privateName.test(name) || ["payload", "connectionid"].includes(name);
	});
}

function publicCollections(
	collections: SdkCollectionLike[],
): SdkCollectionLike[] {
	return collections.filter(function isPublic(collection) {
		return collection.name !== INTERNAL_COLLECTION_NAME;
	});
}

async function readCollections(): Promise<SdkCollectionLike[]> {
	try {
		const collections = await sdk.getCollections();
		return Array.isArray(collections) ? collections : [];
	} catch (error) {
		throw catalogError("list CMS collections", error);
	}
}

/** Enumerate public choices without returning SDK objects or internal storage. */
export async function loadListingCollections(): Promise<
	Array<{ id: string; name: string }>
> {
	return publicCollections(await readCollections()).map(
		function choice(collection) {
			return { id: collection.id, name: collection.name };
		},
	);
}

function catalogError(action: string, error: unknown): Error {
	const detail = error instanceof Error ? ` ${error.message}` : "";
	return new Error(
		`Could not ${action}. Check CMS access in Framer and reselect the catalog collection, then try again.${detail}`,
	);
}

function assertSnapshotSize(
	items: SdkItemLike[],
	collection: SdkCollectionLike,
): void {
	if (items.length > SNAPSHOT_LIMIT) {
		throw new Error(
			`Catalog collection "${collection.name}" contains ${items.length} items, exceeding the ${SNAPSHOT_LIMIT}-item snapshot safety limit. Choose a smaller collection or reduce its item count before inserting the catalog.`,
		);
	}
}

async function activeSettings(): Promise<SyncSettings | null> {
	const connection = await getActiveConnection();
	return connection ? getSyncSettings(connection.id) : null;
}

function demoCatalog(): ListingCatalog {
	return {
		products: demoListingProducts(),
		fields: Object.entries(FIELD_NAMES)
			.filter(function displayField(entry) {
				return entry[0] !== "attributes";
			})
			.map(function defaultField([id, names]) {
				return {
					id,
					name: names[0],
					type: ["price", "regularPrice", "rating", "ratingCount"].includes(id)
						? "number"
						: "string",
				};
			}),
		collectionId: null,
		collectionName: null,
		placeholder: true,
	};
}

/** Read all selected products; an empty real collection remains an empty catalog. */
export async function loadListingCatalog(
	collectionId?: string,
): Promise<ListingCatalog> {
	const collections = await readCollections();
	const explicit = collectionId !== undefined;
	if (
		explicit &&
		collections.some(function isInternal(collection) {
			return (
				collection.id === collectionId &&
				collection.name === INTERNAL_COLLECTION_NAME
			);
		})
	) {
		throw new Error(
			"The Ecom-Link Internal collection is private plugin storage and cannot be used as a catalog. Select a public product collection.",
		);
	}

	let settings: SyncSettings | null;
	try {
		settings = await activeSettings();
	} catch (error) {
		// A manually chosen public collection must not depend on private storage access.
		if (!explicit)
			throw catalogError("read the active catalog settings", error);
		settings = null;
	}
	const targetId = explicit ? collectionId : settings?.targetCollectionId;
	const collection = publicCollections(collections).find(
		function target(candidate) {
			return candidate.id === targetId;
		},
	);
	if (!collection) {
		if (explicit) {
			throw new Error(
				`Catalog collection "${collectionId}" is unavailable. Select an existing public CMS collection in Framer and try again.`,
			);
		}
		return demoCatalog();
	}

	let rawFields: CatalogField[];
	let items: SdkItemLike[];
	try {
		[rawFields, items] = await Promise.all([
			collection.getFields(),
			collection.getItems(),
		]);
		if (!Array.isArray(rawFields) || !Array.isArray(items)) {
			throw new Error(
				"Framer did not return a valid collection schema and item list.",
			);
		}
	} catch (error) {
		throw catalogError(`read catalog collection "${collection.name}"`, error);
	}
	assertSnapshotSize(items, collection);
	const fields = rawFields
		.filter(function publicField(field) {
			if (!isPublicField(field)) return false;
			return (
				!isReference(field) ||
				!collections.some(function internalTarget(candidate) {
					return (
						candidate.id === field.collectionId &&
						candidate.name === INTERNAL_COLLECTION_NAME
					);
				})
			);
		})
		.map(function fieldDescriptor(field): CatalogField {
			// SDK fields may contain methods and metadata; copy only the public schema.
			return {
				id: field.id,
				name: field.name,
				...(field.type ? { type: field.type } : {}),
				...(field.collectionId ? { collectionId: field.collectionId } : {}),
			};
		});
	const mapping = semanticMapping(
		fields,
		settings?.targetCollectionId === collection.id ? settings : null,
	);
	const references = await referenceNames(
		fields,
		publicCollections(collections),
	);
	return {
		products: items.map(function product(item) {
			return toProduct(item, fields, mapping, references);
		}),
		fields,
		collectionId: collection.id,
		collectionName: collection.name,
		placeholder: false,
	};
}

function semanticMapping(
	fields: CatalogField[],
	settings: SyncSettings | null,
): Map<string, string> {
	const mapping = new Map<string, string>();
	if (settings) {
		for (const row of settings.mapping) {
			if (
				!row.enabled ||
				!fields.some(function exists(field) {
					return field.id === row.cmsFieldId;
				})
			)
				continue;
			const semantic =
				row.platformField === "categories"
					? "category"
					: row.platformField === "shortDescription"
						? "description"
						: row.platformField;
			if (
				row.platformField === "shortDescription" &&
				settings.mapping.some(function fullDescription(candidate) {
					return (
						candidate.platformField === "description" &&
						candidate.enabled &&
						fields.some(function exists(field) {
							return field.id === candidate.cmsFieldId;
						})
					);
				})
			)
				continue;
			mapping.set(semantic, row.cmsFieldId);
		}
		return mapping;
	}
	for (const [semantic, names] of Object.entries(FIELD_NAMES)) {
		for (const name of names) {
			const field = fields.find(function named(candidate) {
				return normalized(candidate.name) === normalized(name);
			});
			if (field) {
				mapping.set(semantic, field.id);
				break;
			}
		}
	}
	return mapping;
}

function isReference(field: CatalogField): boolean {
	return (
		field.type === "collectionReference" ||
		field.type === "multiCollectionReference"
	);
}

async function referenceNames(
	fields: CatalogField[],
	collections: SdkCollectionLike[],
): Promise<Map<string, Map<string, string>>> {
	const result = new Map<string, Map<string, string>>();
	for (const field of fields) {
		if (
			!isReference(field) ||
			!field.collectionId ||
			result.has(field.collectionId)
		)
			continue;
		const collection = collections.find(function referenced(candidate) {
			return candidate.id === field.collectionId;
		});
		if (!collection) continue;
		let schema: SdkFieldLike[];
		let items: SdkItemLike[];
		try {
			[schema, items] = await Promise.all([
				collection.getFields(),
				collection.getItems(),
			]);
		} catch {
			// References are optional facets; inaccessible records must not leak raw IDs.
			result.set(collection.id, new Map());
			continue;
		}
		assertSnapshotSize(items, collection);
		const mapping = semanticMapping(schema.filter(isPublicField), null);
		const nameId = mapping.get("name");
		const names = new Map<string, string>();
		for (const item of items) {
			const name = text(nameId ? item.fieldData?.[nameId]?.value : null);
			if (name) names.set(item.id, htmlToText(name));
		}
		result.set(collection.id, names);
	}
	return result;
}

function text(value: unknown): string {
	if (typeof value === "string") return value.trim();
	return typeof value === "number" && Number.isFinite(value)
		? String(value)
		: "";
}

function parsedList(value: unknown): unknown {
	if (typeof value === "string" && value.trim().startsWith("[")) {
		try {
			return JSON.parse(value);
		} catch {
			return [];
		}
	}
	return value;
}

function stringList(value: unknown): string[] {
	const parsed = parsedList(value);
	const entries = Array.isArray(parsed)
		? parsed
		: typeof parsed === "string"
			? parsed.split(",")
			: [];
	const names: string[] = [];
	for (const entry of entries) {
		const name =
			typeof entry === "string"
				? entry.trim()
				: isRecord(entry)
					? text(entry.name)
					: "";
		if (name && !names.includes(name)) names.push(name);
	}
	return names;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function publicValue(
	value: unknown,
	field: CatalogField,
	references: Map<string, Map<string, string>>,
): PublicValue {
	if (isReference(field)) {
		const names = references.get(field.collectionId ?? "");
		const ids = Array.isArray(value) ? value : [value];
		return ids.flatMap(function resolved(id) {
			const name = typeof id === "string" ? names?.get(id) : undefined;
			return name ? [name] : [];
		});
	}
	if (value === null || value === undefined) return null;
	if (field.type === "number") return numericValue(value);
	if (field.type === "boolean") {
		if (value === true || value === "true" || value === 1) return true;
		if (value === false || value === "false" || value === 0) return false;
		return null;
	}
	if (typeof value === "boolean") return value;
	if (typeof value === "number") return Number.isFinite(value) ? value : null;
	if (typeof value === "string" || Array.isArray(value))
		return stringList(value);
	return null;
}

function imageLink(value: unknown): string {
	return safeLink(isRecord(value) ? text(value.url) : text(value)) ?? "";
}

function toProduct(
	item: SdkItemLike,
	fields: CatalogField[],
	mapping: Map<string, string>,
	references: Map<string, Map<string, string>>,
): ListingProduct {
	// Null prototypes keep arbitrary CMS IDs (including __proto__) as inert data.
	const values: ListingProduct["fields"] = Object.create(null);
	for (const field of fields) {
		values[field.id] = publicValue(
			item.fieldData?.[field.id]?.value,
			field,
			references,
		);
	}
	function raw(semantic: Semantic): unknown {
		const id = mapping.get(semantic);
		return id ? item.fieldData?.[id]?.value : undefined;
	}
	for (const semantic of ["category", "brand", "color"] as const) {
		const id = mapping.get(semantic);
		if (!Object.hasOwn(values, semantic))
			values[semantic] = id ? (values[id] ?? []) : [];
	}
	const attributes = parsedList(raw("attributes"));
	if (Array.isArray(attributes)) {
		for (const attribute of attributes) {
			if (!isRecord(attribute) || typeof attribute.name !== "string") continue;
			const name = normalized(attribute.name);
			const semantic =
				name === "colour" || name === "color"
					? "color"
					: name === "brand"
						? "brand"
						: null;
			if (
				semantic &&
				!mapping.has(semantic) &&
				!Object.hasOwn(item.fieldData ?? {}, semantic)
			) {
				const existing = values[semantic];
				values[semantic] = [
					...new Set([
						...(Array.isArray(existing) ? existing : []),
						...stringList(attribute.options),
					]),
				];
			}
		}
	}
	return {
		id: item.id,
		name: htmlToText(text(raw("name"))) || "Untitled product",
		price: numericValue(raw("price")),
		regularPrice: numericValue(raw("regularPrice")),
		imageUrl: imageLink(raw("featuredImage")),
		description: htmlToText(text(raw("description"))),
		rating: numericValue(raw("rating")),
		ratingCount: numericValue(raw("ratingCount")),
		permalink: safeLink(text(raw("permalink"))) ?? "",
		fields: values,
	};
}
