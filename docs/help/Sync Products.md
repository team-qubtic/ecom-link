# Sync Products

Syncing copies products from the connected WooCommerce store into a Framer CMS collection. The first run brings in the whole catalog, and every later run only fetches products that changed since the last successful sync. Mapping, statuses, and caps are all set up in one short wizard.

[Add Sync Products Hero Screenshot]

## Start The First Sync

The first sync goes through a mapping wizard so the products land in the right fields.

1. On the store card, select **Start sync**. The **Map Store Fields** window will open.
2. Under **Collection**, choose the Framer collection that will hold the products. The plugin will read the collection fields and suggest a mapping.
3. Match each store field to a collection field of a matching type, such as prices to a number field. You can keep the suggestions or adjust them. The **Two-way** switches mark fields that will also send Framer edits back to the store, so leave them off while you are starting out. See [Sync Inventory Both Ways](./Sync%20Inventory%20Both%20Ways.md) for the full write-back flow.
4. Under **Product statuses to sync**, check the store statuses to include. Only products with the checked statuses will sync, and published products are checked by default.
5. Review the three caps: **Item safety limit**, **Variant cap**, and **Gallery cap**. Each cap stops the sync at that count so very large stores stay safe. Pick an item safety limit that covers the whole catalog; the default of 500 suits most stores.
6. Select **Start sync**. The wizard will save the mapping and the progress view will take over.

If the collection already holds synced products, the plugin will update them in place, without duplicates.

[Add Map Store Fields Screenshot]

## Follow The Progress

The progress view shows the current page, the processed count, and a progress bar that fills as items are written. Select **Cancel** if you need to stop. The current page will finish first, then the run will end. Everything already synced stays in the collection, and the next run fills in the rest.

[Add Sync Progress Screenshot]

## Read The Sync Report

When a run ends, the report shows a status label and count lines such as `1 item updated.` and `12 items created.` Lines for skipped or failed items appear only when there is something to report.

- **Completed** means the whole catalog portion synced and the sync time advanced.
- **Canceled** means you stopped the run. Nothing is lost; the next run picks up the remainder.
- **Paused** means a page failed and the run stopped there, ready to retry.
- **Stopped early** means a limit stopped the run, such as the item safety limit or the Framer plan limit.

## How Later Syncs Stay Small

Every fully successful run remembers its finish time. The next run only asks the store for products changed after that moment, which keeps repeat syncs fast. If the saved time is ever missing or unreadable, the run falls back to the full catalog and tells you: The last sync time was missing or invalid, so this run synced the full catalog. That fallback is safe. Products are matched by their store ids, so a full pass updates the existing items instead of duplicating them.

## When Items Fail

A slow or busy store can fail single items or whole pages. When that happens, the run pauses and the report lists each failure with its reason, keeping the first 20 failures. A button such as **Retry from page 2** will resume the run from exactly that page. Pages before it do not run again. The sync time only advances after a fully successful run, so a retried run still covers everything that was not confirmed.

## The Safety Limit

A run stops when the item count reaches the item safety limit, and the report says: Sync stopped at the safety limit. Increase it in Settings to continue. Raise the item safety limit in the mapping settings, then start the sync again. Products already in the collection are recognized and updated in place, so nothing duplicates, and a very large store completes across several runs.

## The Framer Plan Limit

If the Framer plan runs out of space for CMS items during a run, the sync stops cleanly and reports how much is left, for example: The Framer plan limit for CMS items was reached. 30 items remain unsynced. The synced items stay in the collection, the sync time does not advance, and the next run after a plan upgrade brings in the rest.

## Remove Products Deleted From The Store

Products deleted in the store stay in the collection until you clean them up. Open the report and select **Check for deleted products**. The plugin will compare the collection against the store and list the products that no longer exist there, or say No deleted products were found. Review the list and select the remove button, labeled with the count, such as **Remove 3 items**. Nothing is deleted without your confirmation.

## What To Read Next

- [Connections](./Connections.md) for adding, editing, checking, switching, and removing stores.
- [Sync Inventory Both Ways](./Sync%20Inventory%20Both%20Ways.md) for sending Framer edits back to the store.
- [Getting Started](./Getting%20Started.md) for the full first-run walkthrough.

## Video tutorial

[Add Sync Products Video Tutorial]
