/**
 * Insertion tracking: remembers the canvas root node of the last storefront
 * component insert per component type, so inserting the same component
 * again replaces the previous layout instead of stacking duplicates on the
 * canvas. Stored as one plugin data item per component (kind
 * "canvas_insert") in the shared internal collection.
 */
import {
  fieldValue,
  readPluginDataItems,
  writePluginDataItems,
} from "./internal"

const PLUGIN_KIND_INSERTION = "canvas_insert"
const GLOBAL_SCOPE = "global"

/**
 * The root node id of the last insert for one component, or null when the
 * component has never been inserted here.
 */
export async function getInsertedRootNodeId(
  componentId: string
): Promise<string | null> {
  try {
    const items = await readPluginDataItems(PLUGIN_KIND_INSERTION, GLOBAL_SCOPE)
    const match = items.find(function matches(item) {
      return fieldValue(item, "item_ref") === componentId
    })
    if (!match) {
      return null
    }
    const payload = fieldValue(match, "payload")
    const parsed: unknown = payload === "" ? null : JSON.parse(payload)
    if (typeof parsed === "object" && parsed !== null) {
      const nodeId = (parsed as Record<string, unknown>).rootNodeId
      return typeof nodeId === "string" ? nodeId : null
    }
    return null
  } catch {
    return null
  }
}

/** Remember the root node id of one component's latest insert. */
export async function saveInsertedRootNodeId(
  componentId: string,
  rootNodeId: string
): Promise<void> {
  try {
    const items = await readPluginDataItems(PLUGIN_KIND_INSERTION, GLOBAL_SCOPE)
    const existing = items.find(function matches(item) {
      return fieldValue(item, "item_ref") === componentId
    })
    await writePluginDataItems([
      {
        ...(existing ? { id: existing.id } : {}),
        kind: PLUGIN_KIND_INSERTION,
        connectionId: GLOBAL_SCOPE,
        itemRef: componentId,
        payload: JSON.stringify({ rootNodeId }),
        syncedAt: new Date().toISOString(),
      },
    ])
  } catch {
    // Tracking failures only cost the replace-on-insert convenience.
  }
}
