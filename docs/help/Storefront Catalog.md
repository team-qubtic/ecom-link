# Build Your Storefront Catalog

You can insert a Shopora-style product listing section with working search, filters, sorting, wishlist, quick view, and pagination. The desktop layout will show a sidebar beside four product columns. On narrow screens, a **Show filters** button will reveal the same filter controls. The insert will not add a site header, footer, navigation, or title banner, so you can use it inside your existing page design.

## 1. Choose Your Product Collection

Open **Components** in the plugin. Next to **Filterable listing**, click the settings icon. Under **CMS collection**, choose your product collection, or leave **Synced collection (automatic)** selected to use the collection saved in your connection settings.

The private **Ecom-Link Internal** collection will not appear. An empty selected collection will show an empty catalog rather than demo products. If no synced collection is available, the automatic option will use clearly marked sample content.

[Add Catalog Collection Settings Screenshot]

## 2. Select Your Filters and CMS Columns

Expand **Filters** in **Catalog Settings**. You can enable or disable Category, Ratings, Brand, Price, Color, and Discount Range individually. For each filter, choose its label, display type, and CMS column. Choose a numeric column for price, rating, or discount. Discount columns should contain percentages from 0 to 100, not fractions. The built-in **Discount** option will calculate the percentage from regular price and price.

Click **Add custom filter** for another field, such as size or material. The column picker will show your collection's available fields by name. Filter values will come from the selected column, not a hardcoded list. Comma-separated text, category lists, and supported collection references will become individual options.

Values selected in one checkbox group will combine as alternatives. Separate filter groups will combine together. For example, selecting blue and red plus one brand will show products from that brand in either color.

[Add Sidebar Filter Mapping Screenshot]

## 3. Configure Search and Display

Expand **Search Fields** and enable the columns you want visitors to search. Search will match all entered words across the enabled fields, ignoring capitalization.

Under **Display Settings**, set your **Catalog label**, three-letter currency code, and products per page. The catalog label will default to **Products** and will name the section for assistive technology without adding a visible page title. The **Brand** filter will still let shoppers filter by product brand. Choose the currency matching your prices: changing the currency code will change formatting, not convert amounts.

Click **Done**, then **Insert** on the Filterable listing card. A new code file and catalog instance will appear in your Framer project. Existing layers and code files will remain unchanged. You can change the instance's **Sidebar filters**, **CMS column**, **Search columns**, and display options from Framer's right sidebar afterward. Give each filter its own unique ID.

## 4. Preview and Publish

New catalogs will start at a fixed width of 1280px with automatic height. For a responsive page, place the catalog inside a frame with a defined width, then set the catalog width to **Fill**. Its columns will adapt to the available space.

Use Framer Preview to try the search field, filters, grid/list buttons, sorting, wishlist, quick view, and page navigation. **Clear all** will reset the query, filters, and wishlist-only view.

Your page's existing header, footer, and navigation will remain separate from the listing. The catalog will not create account or checkout services. Demo shoe photos are illustrative Unsplash images, not the original reference assets. Your selected CMS images will replace them automatically.

## Fix a Catalog That Appears as a Thin Column

Select the outer **Shopora Catalog** layer, not a text layer inside it. Set its width to **Fixed**, enter **1280**, and keep the height set to **Fit Content**. This will give the layout enough room to display normally. You can also use **Fill** inside a parent frame with a defined width.

If you inserted the catalog before the sizing fix, reload the updated plugin and insert a new catalog to get the automatic-width fallback. Existing instances contain a separate copy of the generated code and will not update when the plugin changes. Transfer any custom settings before replacing your old instance; inserting again will not remove it.

## Replace an Older Full-Page Insert

If your existing insert includes a site header, footer, navigation, or title banner, reload the updated plugin and insert a new listing. Existing inserts will keep their separate generated code and will not pick up the listing-only changes automatically. Transfer your collection, filter, search, and display settings, then replace the old instance yourself. A new insertion will leave the old layer and code file untouched.

## Refresh After CMS Changes

The inserted catalog will contain a snapshot of your selected public CMS data. It will work on your published site without plugin access or store API credentials. It will not read later CMS edits automatically.

After syncing or editing products, insert again to create an updated snapshot. Transfer any instance-specific settings you changed in Framer, then replace the old instance yourself. Each insertion will preserve the previous instance and its code file. Publish the updated instance when ready.

Only use a collection intended for public display. Its public text, numeric, boolean, and list fields will be included for field-based filters. Collections above 5,000 items will show an error instead of exporting a partial catalog. Product and image links with executable URL schemes will be ignored.

## Video tutorial

[Add Storefront Catalog Setup Video Tutorial]

## What to Read Next

See [Sync Products](./Sync%20Products.md) to import or refresh your catalog before inserting it.
