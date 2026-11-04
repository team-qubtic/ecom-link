/**
 * MappingModal: the first sync wizard (spec 003).
 *
 * Picks the target collection, suggests a field mapping from field names
 * and types, lets the merchant adjust it row by row, and validates the
 * whole mapping before the run starts so a bad mapping can never reach
 * the store. Settings are saved before the run begins, so a canceled sync
 * keeps its mapping and the next run resumes normally.
 *
 * Two-way switches (spec 004) only unlock for fields the active provider
 * can write back, and a read-only key scope shows the upgrade notice while
 * any two-way field is mapped.
 */

import { useEffect, useState } from "react"
import { createPortal } from "react-dom";
import { ArrowLeft } from "lucide-react";
import { HelpTooltip } from "../components/ui/HelpTooltip";
import { Switch } from "../components/ui/Switch";
import { getProvider, hasProvider } from "../providers";
import type { NormalizedProductField } from "../providers";
import type { ConnectionRecord } from "../storage/connections";
import {
	assertCanEditCms,
	INTERNAL_COLLECTION_NAME,
	sdk,
} from "../storage/internal";
import type { SdkCollectionLike, SdkFieldLike } from "../storage/internal";
import { runsInsideFramer } from "../lib/framer";
import { saveSyncSettings } from "../storage/settings";
import type {
	SyncFieldMapping,
	SyncPlatformField,
	SyncSettings,
} from "../storage/settings";
import { FIELD_TYPE_RULES, validateMapping } from "../sync/engine";
import { WOO_ID_FIELD_NAME } from "../sync/identity";
import pageStyles from "../assets/styles/module/Dashboard.module.css";
import styles from "../assets/styles/module/MappingModal.module.css";

interface MappingModalProps {
  connection: ConnectionRecord
  /** Called after the mapping validates and saves successfully. */
  onStart: (settings: SyncSettings) => void
  onClose: () => void
  /** Explains why the wizard reopened (e.g. the saved collection was deleted). */
  notice?: string
}

interface PlatformFieldOption {
  field: SyncPlatformField
  label: string
}

interface PlatformFieldGroup {
  title: string
  fields: PlatformFieldOption[]
}

/** Store fields grouped for scanning, in the order they appear in the modal. */
const PLATFORM_FIELD_GROUPS: PlatformFieldGroup[] = [
  {
    title: "Basics",
    fields: [
      { field: "name", label: "Name" },
      { field: "slug", label: "Slug" },
      { field: "permalink", label: "Permalink" },
      { field: "status", label: "Status" },
      { field: "sku", label: "SKU" },
    ],
  },
  {
    title: "Prices",
    fields: [
      { field: "price", label: "Price" },
      { field: "regularPrice", label: "Regular price" },
      { field: "salePrice", label: "Sale price" },
      { field: "onSale", label: "On sale" },
    ],
  },
  {
    title: "Descriptions",
    fields: [
      { field: "description", label: "Description" },
      { field: "shortDescription", label: "Short description" },
    ],
  },
  {
    title: "Media",
    fields: [
      { field: "featuredImage", label: "Featured image" },
      { field: "gallery", label: "Gallery" },
    ],
  },
  {
    title: "Inventory",
    fields: [
      { field: "stockStatus", label: "Stock status" },
      { field: "stockQuantity", label: "Stock quantity" },
    ],
  },
  {
    title: "Organization",
    fields: [
      { field: "categories", label: "Categories" },
      { field: "tags", label: "Tags" },
      { field: "attributes", label: "Attributes" },
      { field: "variants", label: "Variants" },
    ],
  },
  {
    title: "More",
    fields: [
      { field: "rating", label: "Rating" },
      { field: "ratingCount", label: "Rating count" },
      { field: "lastModified", label: "Last modified" },
      { field: "id", label: "Product id" },
    ],
  },
]

/** Collection field names that plausibly hold one store field, per platform field. */
const FIELD_NAME_HINTS: Record<SyncPlatformField, string[]> = {
  id: ["id", "productid", "wooid"],
  name: ["name", "title", "productname"],
  slug: ["slug"],
  permalink: ["permalink", "link", "url"],
  status: ["status"],
  description: ["description", "body", "details"],
  shortDescription: ["shortdescription", "excerpt", "summary"],
  sku: ["sku"],
  price: ["price", "currentprice"],
  regularPrice: ["regularprice"],
  salePrice: ["saleprice"],
  onSale: ["onsale"],
  stockStatus: ["stockstatus"],
  stockQuantity: ["stockquantity", "stock", "inventory"],
  categories: ["categories", "category"],
  tags: ["tags", "tag"],
  featuredImage: ["featuredimage", "image", "mainimage", "photo"],
  gallery: ["gallery", "images", "imagegallery"],
  attributes: ["attributes", "attribute"],
  variants: ["variants", "variations"],
  rating: ["rating", "stars"],
  ratingCount: ["ratingcount", "reviews", "reviewcount"],
  lastModified: ["lastmodified", "modified", "updated", "updatedat"],
}

/** Store product statuses the merchant can choose to sync. */
const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "publish", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "pending", label: "Pending" },
  { value: "private", label: "Private" },
]

const COLLECTIONS_ERROR_MESSAGE =
  "Collections could not be loaded. Close and reopen the plugin, then try again."
const FIELDS_ERROR_MESSAGE =
  "The collection fields could not be loaded. Pick the collection again."
const NO_COLLECTIONS_MESSAGE =
	"No collections were found. Switch to New collection below to create one."
const NO_FIELDS_MESSAGE =
  "This collection has no fields yet. Add fields in Framer first, then map them here."
const CHOOSE_COLLECTION_MESSAGE = "Choose a collection to sync into."
const SAVE_ERROR_MESSAGE = "The mapping could not be saved. Try again."
const CREATE_ERROR_MESSAGE =
	"The collection could not be created. Try again, or use an existing collection."
const RE_DETECT_NOTE =
  "This collection already has synced products. They will be updated in place, without duplicates."
const MAPPING_HELP_TEXT =
  "Match each store field to a collection field of a matching type. The Two-way switches mark fields that will also send Framer edits back to the store."
const STATUSES_HELP_TEXT = "Only products with the checked store statuses are synced."
const READ_ONLY_MEDIA_NOTE = "Images and variants are read-only for now."
const READ_ONLY_NOTE_FIELDS: SyncPlatformField[] = ["featuredImage", "gallery", "variants"]
const TWO_WAY_KEY_SCOPE_NOTICE =
  "Two-way sync needs keys with read and write permission. Edit the connection to upgrade your keys, then sync."
const CAPS_HELP_TEXT = "Each cap stops the sync at that count so very large stores stay safe."

/** Human CMS field name for one store field, used when creating a collection. */
const PLATFORM_FIELD_LABELS: Record<SyncPlatformField, string> =
	Object.fromEntries(
		PLATFORM_FIELD_GROUPS.flatMap(function allFields(
			group: PlatformFieldGroup,
		) {
			return group.fields.map(function labelOf(option: PlatformFieldOption) {
				return [option.field, option.label];
			});
		}),
	) as Record<SyncPlatformField, string>;

/**
 * The fields a brand new collection will be created with: one field per
 * store field, typed with the first allowed type from the field rules.
 */
function buildVirtualFields(): SdkFieldLike[] {
	return PLATFORM_FIELD_GROUPS.flatMap(function allFields(
		group: PlatformFieldGroup,
	) {
		return group.fields.map(function toVirtualField(
			option: PlatformFieldOption,
		) {
			return {
				id: `new-${option.field}`,
				name: PLATFORM_FIELD_LABELS[option.field],
				type: FIELD_TYPE_RULES[option.field].allowed[0],
			};
		});
	});
}

/**
 * Default collection name for a connection: ecom-link-woo- followed by the
 * site name from the store host (mystore.com becomes ecom-link-woo-mystore).
 */
function defaultNewCollectionName(storeHost: string): string {
	const site = storeHost
		.replace(/^www\./, "")
		.split(".")[0]
		.replace(/[^a-z0-9]/gi, "")
		.toLowerCase();
	return site !== "" ? `ecom-link-woo-${site}` : "ecom-link-woo-store";
}

/** Normalize a field name for comparisons: lowercase, letters and digits only. */
function nameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "")
}

/** The effective type of a collection field, defaulting to text like the SDK. */
function fieldTypeOf(field: SdkFieldLike): string {
  return field.type ?? "string"
}

/** The woo_id identity field is managed by the sync engine and never mapped by hand. */
function isIdentityField(field: SdkFieldLike): boolean {
  return nameKey(field.name) === nameKey(WOO_ID_FIELD_NAME)
}

/**
 * Suggest a collection field for one store field: the first unused field of a
 * matching type whose name matches one of the known hints.
 */
function suggestMapping(
  platformField: SyncPlatformField,
  candidates: SdkFieldLike[],
  used: Set<string>
): string {
  const hints = FIELD_NAME_HINTS[platformField]
  const allowed = FIELD_TYPE_RULES[platformField].allowed
  for (const hint of hints) {
    const match = candidates.find(function matchesHint(field: SdkFieldLike) {
      if (used.has(field.id)) {
        return false
      }
      if (isIdentityField(field)) {
        return false
      }
      if (allowed.indexOf(fieldTypeOf(field)) === -1) {
        return false
      }
      return nameKey(field.name) === hint
    })
    if (match) {
      used.add(match.id)
      return match.id
    }
  }
  return ""
}

/** Build a full suggested mapping for every store field, one field per CMS field. */
function buildSuggestedRows(candidates: SdkFieldLike[]): SyncFieldMapping[] {
  const used = new Set<string>()
  const suggested: SyncFieldMapping[] = []
  for (const group of PLATFORM_FIELD_GROUPS) {
    for (const option of group.fields) {
      suggested.push({
        platformField: option.field,
        cmsFieldId: suggestMapping(option.field, candidates, used),
        direction: "platform-to-cms",
        enabled: true,
      })
    }
  }
  return suggested
}

/** Parse a cap input, falling back to the default when it is not a positive integer. */
function parseCapValue(valueText: string, fallback: number): number {
  const parsed = Number.parseInt(valueText, 10)
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed
  }
  return fallback
}

/** Whether the active provider can write this store field back to the store. */
function fieldIsWritable(
  platformField: SyncPlatformField,
  writableFields: NormalizedProductField[]
): boolean {
  return writableFields.some(function matchesWritable(candidate: NormalizedProductField) {
    return candidate === platformField
  })
}

/**
 * Render the first sync wizard: collection picker, per field mapping rows
 * with type-aware suggestions and Two-way switches, statuses, and caps.
 */
export function MappingModal({
	connection,
	onStart,
	onClose,
	notice,
}: MappingModalProps) {
	const [collections, setCollections] = useState<SdkCollectionLike[]>([]);
	const [loadingCollections, setLoadingCollections] = useState(true);
	const [collectionsError, setCollectionsError] = useState("");
	const [targetCollectionId, setTargetCollectionId] = useState("");
	const [fields, setFields] = useState<SdkFieldLike[]>([]);
	const [loadingFields, setLoadingFields] = useState(false);
	const [rows, setRows] = useState<SyncFieldMapping[]>([]);
	const [statuses, setStatuses] = useState<string[]>(["publish"]);
	const [safetyCapText, setSafetyCapText] = useState("500");
	const [variationsCapText, setVariationsCapText] = useState("30");
	const [galleryCapText, setGalleryCapText] = useState("10");
	const [problem, setProblem] = useState("");
	const [starting, setStarting] = useState(false);
	/** Where products sync into: a collection the user picks, or a new one. */
	const [source, setSource] = useState<"existing" | "create">("existing");
	const [newCollectionName, setNewCollectionName] = useState("");

	useEffect(
		function prefillNameOnMount() {
			setNewCollectionName(defaultNewCollectionName(connection.storeHost));
		},
		[connection.storeHost],
	);

	function handleSourceChange(next: "existing" | "create") {
		setSource(next);
		setProblem("");
		if (next === "create") {
			// A brand new collection: fields are created from the mapped rows, so
			// the mapping suggestions point at the virtual field list.
			const virtualFields = buildVirtualFields();
			setFields(virtualFields);
			setRows(buildSuggestedRows(virtualFields));
			return;
		}
		setFields([]);
		setRows([]);
		setTargetCollectionId("");
	}

  useEffect(
    function loadCollectionsOnMount() {
      let active = true
      async function loadCollections() {
        setLoadingCollections(true)
        try {
          const all = await sdk.getCollections()
          if (!active) {
            return
          }
          const usable = all.filter(function isSyncable(collection: SdkCollectionLike) {
            return collection.name !== INTERNAL_COLLECTION_NAME
          })
          setCollections(usable)
        } catch {
          if (active) {
            setCollectionsError(COLLECTIONS_ERROR_MESSAGE)
          }
        } finally {
          if (active) {
            setLoadingCollections(false)
          }
        }
      }
      void loadCollections()
      return function markInactive() {
        active = false
      }
    },
    []
  )

  async function handleCollectionChange(collectionId: string) {
    setTargetCollectionId(collectionId)
    setFields([])
    setRows([])
    setProblem("")
    if (collectionId === "") {
      return
    }
    const collection = collections.find(function byId(candidate: SdkCollectionLike) {
      return candidate.id === collectionId
    })
    if (!collection) {
      return
    }
    setLoadingFields(true)
    try {
      const collectionFields = await collection.getFields()
      setFields(collectionFields)
      setRows(buildSuggestedRows(collectionFields))
    } catch {
      setProblem(FIELDS_ERROR_MESSAGE)
    } finally {
      setLoadingFields(false)
    }
  }

  function updateRow(platformField: SyncPlatformField, patch: Partial<SyncFieldMapping>) {
    setRows(function applyPatch(current: SyncFieldMapping[]): SyncFieldMapping[] {
      return current.map(function mapRow(row: SyncFieldMapping): SyncFieldMapping {
        return row.platformField === platformField ? { ...row, ...patch } : row
      })
    })
  }

  function handleStatusToggle(status: string, checked: boolean) {
    setStatuses(function update(current: string[]): string[] {
      if (!checked) {
        // Keep at least one status selected so the store filter never empties.
        if (current.length === 1) {
          return current
        }
        return current.filter(function withoutStatus(entry: string) {
          return entry !== status
        })
      }
      if (current.indexOf(status) === -1) {
        return [...current, status]
      }
      return current
    })
  }

	async function handleStart() {
		if (source === "existing" && targetCollectionId === "") {
			setProblem(CHOOSE_COLLECTION_MESSAGE);
			return;
		}
		if (source === "create" && newCollectionName.trim() === "") {
			setProblem("Name the new collection first.");
			return;
		}
		let effectiveFields = fields;
		let effectiveRows = rows;
		if (source === "create") {
			effectiveFields = buildVirtualFields();
		}
		const mapping = effectiveRows.filter(function syncedRows(
			row: SyncFieldMapping,
		) {
			return row.enabled && row.cmsFieldId !== "";
		});
		const settings: SyncSettings = {
			targetCollectionId,
			mapping,
			defaultItemStatus: "draft",
			statusesFilter: statuses,
			safetyCap: parseCapValue(safetyCapText, 500),
			variationsCap: parseCapValue(variationsCapText, 30),
			galleryCap: parseCapValue(galleryCapText, 10),
		};
		const mappingProblem = validateMapping(settings, effectiveFields);
		if (mappingProblem !== null) {
			setProblem(mappingProblem.message);
			return;
		}
		setStarting(true);
		setProblem("");
		try {
			if (source === "create") {
				assertCanEditCms("createCollection");
				const name = newCollectionName.trim();
				const created = await sdk.createCollection(name);
				// New collections ship with default fields (Slug, Status), and
				// addFields rejects duplicate names or unsupported types, which
				// would abort the whole batch. Filter to genuinely new fields
				// with valid types and reuse the defaults via the name remap.
				const defaultFields = await created.getFields();
				const defaultNames = new Set(
					defaultFields.map(function defaultName(field: SdkFieldLike) {
						return nameKey(field.name);
					}),
				);
				const definitions = mapping
					.map(function toDefinition(row: SyncFieldMapping) {
						const allowed = FIELD_TYPE_RULES[row.platformField].allowed;
						return {
							row,
							name: PLATFORM_FIELD_LABELS[row.platformField],
							type: allowed[0] === "array" ? "string" : allowed[0],
						};
					})
					.filter(function isNewField(definition) {
						return !defaultNames.has(nameKey(definition.name));
					});
				if (definitions.length > 0) {
					await created.addFields(
						definitions.map(function toAddField(definition) {
							return { name: definition.name, type: definition.type };
						}),
					);
				}
				const createdFields = await created.getFields();
				const createdName =
					typeof created.name === "string" && created.name !== ""
						? created.name
						: name;
				const createdSettings: SyncSettings = {
					...settings,
					targetCollectionId: created.id,
					targetCollectionName: createdName,
					mapping: mapping
						.map(function pointToCreated(row: SyncFieldMapping) {
							const label = PLATFORM_FIELD_LABELS[row.platformField];
							const createdField = createdFields.find(function byName(
								candidate: SdkFieldLike,
							) {
								return nameKey(candidate.name) === nameKey(label);
							});
							return { ...row, cmsFieldId: createdField ? createdField.id : "" };
						})
						.filter(function matchedOnly(row: SyncFieldMapping) {
							return row.cmsFieldId !== "";
						}),
				};
				await saveSyncSettings(connection.id, createdSettings);
				onStart(createdSettings);
				return;
			}
			await saveSyncSettings(connection.id, settings);
			onStart(settings);
		} catch {
			setStarting(false);
			setProblem(
				source === "create" && !runsInsideFramer()
				? "Collections can only be created inside the Framer app. Open Ecom Link from the Framer canvas and sync from there."
				: source === "create"
					? CREATE_ERROR_MESSAGE
					: SAVE_ERROR_MESSAGE,
			);
		}
	}

  const selectableFields = fields.filter(function notIdentity(field: SdkFieldLike) {
    return !isIdentityField(field)
  })
  const hasSyncedBefore = fields.some(isIdentityField)
  const writableFields = hasProvider(connection.providerId)
    ? getProvider(connection.providerId).capabilities.writableFields
    : []
  const hasTwoWayRow = rows.some(function isTwoWay(row: SyncFieldMapping) {
    return row.direction === "bidirectional" && row.cmsFieldId !== ""
  })
  const needsKeyUpgrade = hasTwoWayRow && connection.keyScope !== "read_write"

	function renderRow(option: PlatformFieldOption) {
		const row = rows.find(function matchesField(current: SyncFieldMapping) {
			return current.platformField === option.field;
		});
		if (!row) {
			return null;
		}
		const rule = FIELD_TYPE_RULES[option.field];
		const createMode = source === "create";
		const takenByOthers = new Set(
			rows
				.filter(function otherMapped(current: SyncFieldMapping) {
					return (
						current.platformField !== option.field && current.cmsFieldId !== ""
					);
				})
				.map(function idOf(current: SyncFieldMapping) {
					return current.cmsFieldId;
				}),
		);
		const selectId = `mapping-${option.field}`;
		const twoWayAvailable = fieldIsWritable(option.field, writableFields);
		return (
			<div className={styles.mappingRow} key={option.field}>
				<div className={styles.mappingRowHead}>
					<label
						className={styles.mappingLabel}
						htmlFor={createMode ? undefined : selectId}
					>
						{option.label}
					</label>
					<Switch
						checked={
							createMode
								? row.enabled
								: twoWayAvailable && row.direction === "bidirectional"
						}
						onChange={function toggleRow(next: boolean) {
							if (createMode) {
								updateRow(option.field, { enabled: next });
							} else {
								updateRow(option.field, {
									direction: next ? "bidirectional" : "platform-to-cms",
								});
							}
						}}
						ariaLabel={
							createMode
								? `Create the ${option.label} field in the new collection`
								: twoWayAvailable
									? `${option.label} syncs both ways`
									: `${option.label} cannot sync both ways`
						}
						disabled={!createMode && !twoWayAvailable}
					/>
				</div>
				{READ_ONLY_NOTE_FIELDS.indexOf(option.field) !== -1 && !createMode ? (
					<p className="muted small">{READ_ONLY_MEDIA_NOTE}</p>
				) : null}
				{createMode ? (
					<p className="muted small">
						Created as &quot;{option.label}&quot; in the new collection.
					</p>
				) : (
					<select
						id={selectId}
						className={styles.mappingSelect}
						value={row.cmsFieldId}
						onChange={function pickCmsField(
							event: React.ChangeEvent<HTMLSelectElement>,
						) {
							updateRow(option.field, { cmsFieldId: event.target.value });
						}}
					>
						<option value="">Not synced</option>
						{selectableFields.map(function renderFieldOption(
							field: SdkFieldLike,
						) {
							const typeOk = rule.allowed.indexOf(fieldTypeOf(field)) !== -1;
							const taken = takenByOthers.has(field.id);
							let optionLabel = field.name;
							if (!typeOk) {
								optionLabel = `${field.name} - wrong field type`;
							} else if (taken) {
								optionLabel = `${field.name} - already mapped`;
							}
							return (
								<option
									key={field.id}
									value={field.id}
									disabled={!typeOk || taken}
								>
									{optionLabel}
								</option>
							);
						})}
					</select>
				)}
			</div>
		);
	}

  function renderGroup(group: PlatformFieldGroup) {
    return (
      <div className={styles.group} key={group.title}>
        <h4 className={styles.groupTitle}>{group.title}</h4>
        {group.fields.map(renderRow)}
      </div>
    )
  }

  function renderStatusOption(option: { value: string; label: string }) {
    const checked = statuses.indexOf(option.value) !== -1
    return (
      <label className={styles.checkboxRow} key={option.value}>
        <input
          type="checkbox"
          checked={checked}
          onChange={function toggleStatus(event: React.ChangeEvent<HTMLInputElement>) {
            handleStatusToggle(option.value, event.target.checked)
          }}
        />
        <span>{option.label}</span>
      </label>
    )
  }

  function renderCapField(
    id: string,
    label: string,
    valueText: string,
    onChange: (next: string) => void
  ) {
    return (
      <div className={styles.capField} key={id}>
        <label className={styles.capLabel} htmlFor={id}>
          {label}
        </label>
        <input
          id={id}
          className={styles.capInput}
          type="text"
          inputMode="numeric"
          value={valueText}
          onChange={function changeCap(event: React.ChangeEvent<HTMLInputElement>) {
            onChange(event.target.value)
          }}
        />
      </div>
    )
  }

	const startDisabled =
		starting ||
		(source === "existing" &&
			(loadingCollections || loadingFields || collections.length === 0)) ||
		(source === "create" && newCollectionName.trim() === "");
	const portalTarget =
		document.querySelector(".app-shell-content") ?? document.body;
	return createPortal(
		<div className={styles.wizardPage}>
			<header className={pageStyles.pageHeader}>
				<div className={pageStyles.headerBrand}>
					<button
						type="button"
						className={styles.wizardBack}
						onClick={onClose}
						aria-label="Back"
					>
						<ArrowLeft size={15} aria-hidden="true" />
					</button>
					<div className={pageStyles.headerText}>
						<h1 className={pageStyles.pageTitle}>Map Store Fields</h1>
					</div>
				</div>
				<div className={pageStyles.headerActions}>
					<HelpTooltip text="Choose where synced products land, then match each store field to a collection field. The choice is saved with the connection." />
				</div>
			</header>

			<div className={styles.wizardBody}>
				{notice ? (
					<div className="notice notice-warning" role="status">
						<p>{notice}</p>
					</div>
				) : null}
				{collectionsError !== "" ? (
					<div className="notice notice-error" role="alert">
						<p>{collectionsError}</p>
					</div>
				) : null}
				{problem !== "" ? (
					<div className="notice notice-error" role="alert">
						<p>{problem}</p>
					</div>
				) : null}

				{/* Collection source: existing collection or a new one */}
				<div className={styles.sectionHeadingRow}>
					<h3 className={styles.sectionHeading}>Collection</h3>
					<HelpTooltip text="Sync into a collection you already have, or let Ecom-Link create a new collection named after your store. The choice is saved with the connection, so the next sync skips this step." />
				</div>
				<div className={styles.sourceChoice}>
					<button
						type="button"
						className={
							source === "existing"
								? `${styles.sourceOption} ${styles.sourceOptionActive}`
								: styles.sourceOption
						}
						aria-pressed={source === "existing"}
						onClick={function pickExisting() {
							handleSourceChange("existing");
						}}
					>
						<span className={styles.sourceOptionTitle}>
							Existing collection
						</span>
						<span className={styles.sourceOptionHint}>
							Add products to a collection you already have.
						</span>
					</button>
					<button
						type="button"
						className={
							source === "create"
								? `${styles.sourceOption} ${styles.sourceOptionActive}`
								: styles.sourceOption
						}
						aria-pressed={source === "create"}
						onClick={function pickCreate() {
							handleSourceChange("create");
						}}
					>
						<span className={styles.sourceOptionTitle}>New collection</span>
						<span className={styles.sourceOptionHint}>
							Created for you as {newCollectionName || "ecom-link-woo-store"}.
						</span>
					</button>
				</div>

				{source === "existing" ? (
					loadingCollections ? (
						<p className="muted">Loading collections.</p>
					) : collections.length === 0 ? (
						<div className="notice notice-warning">
							<p>{NO_COLLECTIONS_MESSAGE}</p>
						</div>
					) : (
						<div className={styles.collectionField}>
							<label className={styles.fieldLabel} htmlFor="mapping-collection">
								Collection
							</label>
							<select
								id="mapping-collection"
								className={styles.mappingSelect}
								value={targetCollectionId}
								onChange={function pickCollection(
									event: React.ChangeEvent<HTMLSelectElement>,
								) {
									void handleCollectionChange(event.target.value);
								}}
							>
								<option value="">Choose a collection</option>
								{collections.map(function renderCollectionOption(
									collection: SdkCollectionLike,
								) {
									return (
										<option key={collection.id} value={collection.id}>
											{collection.name}
										</option>
									);
								})}
							</select>
						</div>
					)
				) : (
					<div className={styles.collectionField}>
						<label className={styles.fieldLabel} htmlFor="new-collection-name">
							New collection name
						</label>
						<input
							id="new-collection-name"
							className={styles.mappingSelect}
							value={newCollectionName}
							onChange={function changeName(
								event: React.ChangeEvent<HTMLInputElement>,
							) {
								setNewCollectionName(event.target.value);
							}}
						/>
						<p className="muted small">
							A new CMS collection is created with fields for the mapped store
							fields below.
						</p>
					</div>
				)}
				{hasSyncedBefore && source === "existing" ? (
					<p className={styles.reDetectNote}>{RE_DETECT_NOTE}</p>
				) : null}
				{loadingFields ? (
					<p className="muted">Loading collection fields.</p>
				) : null}
				{source === "create" ||
				(targetCollectionId !== "" && !loadingFields) ? (
					<>
						<div className={styles.sectionHeadingRow}>
							<h3 className={styles.sectionHeading}>Map Store Fields</h3>
							<HelpTooltip text={MAPPING_HELP_TEXT} />
						</div>
						{needsKeyUpgrade ? (
							<div className="notice notice-warning">
								<p>{TWO_WAY_KEY_SCOPE_NOTICE}</p>
							</div>
						) : null}
						{fields.length === 0 ? (
							<p className="muted small">{NO_FIELDS_MESSAGE}</p>
						) : (
							PLATFORM_FIELD_GROUPS.map(renderGroup)
						)}
						<div className={styles.sectionHeadingRow}>
							<h3 className={styles.sectionHeading}>Sync Settings</h3>
						</div>
						<div className={styles.statusesBlock}>
							<div className={styles.statusesHead}>
								<span className={styles.fieldLabel}>
									Product statuses to sync
								</span>
								<HelpTooltip text={STATUSES_HELP_TEXT} />
							</div>
							<div className={styles.statusesGrid}>
								{STATUS_OPTIONS.map(renderStatusOption)}
							</div>
						</div>
						<div className={styles.capsBlock}>
							<div className={styles.statusesHead}>
								<span className={styles.fieldLabel}>Limits</span>
								<HelpTooltip text={CAPS_HELP_TEXT} />
							</div>
							<div className={styles.capsGrid}>
								{renderCapField(
									"mapping-safety-cap",
									"Item safety limit",
									safetyCapText,
									setSafetyCapText,
								)}
								{renderCapField(
									"mapping-variations-cap",
									"Variant cap",
									variationsCapText,
									setVariationsCapText,
								)}
								{renderCapField(
									"mapping-gallery-cap",
									"Gallery cap",
									galleryCapText,
									setGalleryCapText,
								)}
							</div>
						</div>
					</>
				) : null}
			</div>

			<footer className={pageStyles.formActions}>
				<button
					type="button"
					className="btn btn-secondary"
					onClick={onClose}
					disabled={starting}
				>
					Cancel
				</button>
				<button
					type="button"
					className="btn btn-primary"
					onClick={function startSync() {
						void handleStart();
					}}
					disabled={startDisabled}
				>
					{starting
						? source === "create"
							? "Creating…"
							: "Saving…"
						: source === "create"
							? "Create and Sync"
							: "Start sync"}
				</button>
			</footer>
		</div>,
		portalTarget,
	);
}
