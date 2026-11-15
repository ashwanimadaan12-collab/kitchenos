import bcrypt from "bcryptjs";
import { PrismaClient } from "../generated/client/index.js";
import { PERMISSIONS_CATALOGUE as PERMISSIONS } from "./permissions-catalogue.js";

const prisma = new PrismaClient();
const BCRYPT_ROUNDS = 12;

function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, BCRYPT_ROUNDS);
}

const ORG_ADMIN_PERMISSIONS = [
  "org:manage",
  "org:view",
  "user:manage",
  "role:manage",
  "audit:view",
  "brand:manage",
  "brand:view",
  "kitchen:manage",
  "kitchen:view",
  "outlet:manage",
  "outlet:view",
  "tax_category:manage",
  "tax_category:view",
  "product_category:manage",
  "product_category:view",
  "product:manage",
  "product:view",
  "menu:manage",
  "menu:view",
  "price:manage",
  "price:view",
  "ingredient:manage",
  "ingredient:view",
  "recipe:manage",
  "recipe:view",
  "cost:manage",
  "cost:view",
  "order:manage",
  "order:view",
  "payment:manage",
  "payment:view",
  "kds:manage",
  "kds:view",
  "supplier:manage",
  "supplier:view",
  "purchase_order:manage",
  "purchase_order:view",
  "inventory:manage",
  "inventory:view",
  "combo:manage",
  "combo:view",
  "promotion:manage",
  "promotion:view",
  "report:view",
  "expense:manage",
  "expense:view",
  "employee:manage",
  "employee:view",
  "attendance:manage",
  "attendance:view",
  "customer:manage",
  "customer:view",
  "communication:manage",
  "communication:view",
  "loyalty:manage",
  "loyalty:view",
  "campaign:manage",
  "campaign:view",
  "table:manage",
  "table:view",
];

async function main() {
  await prisma.permission.createMany({
    data: PERMISSIONS.map((p) => ({ key: p.key, description: p.description })),
    skipDuplicates: true,
  });

  const org = await prisma.organization.upsert({
    where: { slug: "demo-restaurants" },
    update: {},
    create: { name: "Demo Restaurants Pvt Ltd", slug: "demo-restaurants" },
  });

  const orgAdminRole = await prisma.role.upsert({
    where: { organizationId_name: { organizationId: org.id, name: "Org Admin" } },
    update: {},
    create: {
      organizationId: org.id,
      name: "Org Admin",
      description: "Full access within the organization",
    },
  });

  const permissions = await prisma.permission.findMany({
    where: { key: { in: ORG_ADMIN_PERMISSIONS } },
  });

  await prisma.$transaction(
    permissions.map((permission) =>
      prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: orgAdminRole.id, permissionId: permission.id } },
        update: {},
        create: { roleId: orgAdminRole.id, permissionId: permission.id },
      }),
    ),
  );

  const adminEmail = "admin@demo-restaurants.test";
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: hashPassword("ChangeMe123!"),
      firstName: "Demo",
      lastName: "Admin",
    },
  });

  await prisma.organizationMembership.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: admin.id } },
    update: {},
    create: { organizationId: org.id, userId: admin.id, roleId: orgAdminRole.id },
  });

  // --- Prompt 02: brands, kitchens, outlets -------------------------------

  const [oldMonk, paproni, bakery] = await Promise.all([
    prisma.brand.upsert({
      where: { organizationId_slug: { organizationId: org.id, slug: "cafe-old-monk" } },
      update: {},
      create: { organizationId: org.id, name: "Cafe Old Monk", slug: "cafe-old-monk" },
    }),
    prisma.brand.upsert({
      where: { organizationId_slug: { organizationId: org.id, slug: "pizza-paproni" } },
      update: {},
      create: { organizationId: org.id, name: "Pizza Paproni", slug: "pizza-paproni" },
    }),
    prisma.brand.upsert({
      where: { organizationId_slug: { organizationId: org.id, slug: "bounty-bakery" } },
      update: {},
      create: { organizationId: org.id, name: "Bounty Bakery", slug: "bounty-bakery" },
    }),
  ]);

  const [centralWarehouse, oldMonkKitchen, sharedKitchen] = await Promise.all([
    prisma.kitchen.upsert({
      where: { organizationId_code: { organizationId: org.id, code: "CWH-01" } },
      update: {},
      create: { organizationId: org.id, name: "Central Warehouse", code: "CWH-01", kind: "CENTRAL_WAREHOUSE" },
    }),
    prisma.kitchen.upsert({
      where: { organizationId_code: { organizationId: org.id, code: "KOM-01" } },
      update: {},
      create: { organizationId: org.id, name: "Old Monk Kitchen", code: "KOM-01" },
    }),
    prisma.kitchen.upsert({
      where: { organizationId_code: { organizationId: org.id, code: "KSH-01" } },
      update: {},
      create: { organizationId: org.id, name: "Shared Kitchen (Paproni & Bakery)", code: "KSH-01" },
    }),
  ]);

  await Promise.all([
    prisma.kitchenStation.upsert({
      where: { kitchenId_code: { kitchenId: oldMonkKitchen.id, code: "GRILL-01" } },
      update: {},
      create: { kitchenId: oldMonkKitchen.id, name: "Grill", code: "GRILL-01" },
    }),
    prisma.kitchenStation.upsert({
      where: { kitchenId_code: { kitchenId: oldMonkKitchen.id, code: "PACK-01" } },
      update: {},
      create: { kitchenId: oldMonkKitchen.id, name: "Packing", code: "PACK-01" },
    }),
    prisma.kitchenStation.upsert({
      where: { kitchenId_code: { kitchenId: sharedKitchen.id, code: "OVEN-01" } },
      update: {},
      create: { kitchenId: sharedKitchen.id, name: "Pizza Oven", code: "OVEN-01" },
    }),
    prisma.kitchenStation.upsert({
      where: { kitchenId_code: { kitchenId: sharedKitchen.id, code: "BAKE-01" } },
      update: {},
      create: { kitchenId: sharedKitchen.id, name: "Bakery", code: "BAKE-01" },
    }),
    prisma.kitchenStation.upsert({
      where: { kitchenId_code: { kitchenId: sharedKitchen.id, code: "PACK-01" } },
      update: {},
      create: { kitchenId: sharedKitchen.id, name: "Packing", code: "PACK-01" },
    }),
  ]);

  // Old Monk Kitchen is dedicated to Cafe Old Monk; the shared kitchen produces
  // for two brands at once; the central warehouse backs every brand.
  const brandKitchenLinks: Array<{ brandId: string; kitchenId: string; isPrimary: boolean }> = [
    { brandId: oldMonk.id, kitchenId: oldMonkKitchen.id, isPrimary: true },
    { brandId: oldMonk.id, kitchenId: centralWarehouse.id, isPrimary: false },
    { brandId: paproni.id, kitchenId: sharedKitchen.id, isPrimary: true },
    { brandId: paproni.id, kitchenId: centralWarehouse.id, isPrimary: false },
    { brandId: bakery.id, kitchenId: sharedKitchen.id, isPrimary: true },
    { brandId: bakery.id, kitchenId: centralWarehouse.id, isPrimary: false },
  ];
  await Promise.all(
    brandKitchenLinks.map((link) =>
      prisma.brandKitchen.upsert({
        where: { brandId_kitchenId: { brandId: link.brandId, kitchenId: link.kitchenId } },
        update: {},
        create: link,
      }),
    ),
  );

  const outlets = await Promise.all([
    prisma.outlet.upsert({
      where: { organizationId_code: { organizationId: org.id, code: "OM-CP-01" } },
      update: {},
      create: {
        organizationId: org.id,
        brandId: oldMonk.id,
        name: "Old Monk - Connaught Place",
        code: "OM-CP-01",
        city: "New Delhi",
      },
    }),
    prisma.outlet.upsert({
      where: { organizationId_code: { organizationId: org.id, code: "OM-SKT-01" } },
      update: {},
      create: {
        organizationId: org.id,
        brandId: oldMonk.id,
        name: "Old Monk - Saket",
        code: "OM-SKT-01",
        city: "New Delhi",
      },
    }),
    prisma.outlet.upsert({
      where: { organizationId_code: { organizationId: org.id, code: "PP-IND-01" } },
      update: {},
      create: {
        organizationId: org.id,
        brandId: paproni.id,
        name: "Paproni - Indiranagar",
        code: "PP-IND-01",
        city: "Bengaluru",
      },
    }),
    prisma.outlet.upsert({
      where: { organizationId_code: { organizationId: org.id, code: "BB-MG-01" } },
      update: {},
      create: {
        organizationId: org.id,
        brandId: bakery.id,
        name: "Bounty - MG Road",
        code: "BB-MG-01",
        city: "Bengaluru",
      },
    }),
  ]);

  const primaryKitchenByBrand: Record<string, string> = {
    [oldMonk.id]: oldMonkKitchen.id,
    [paproni.id]: sharedKitchen.id,
    [bakery.id]: sharedKitchen.id,
  };
  await Promise.all(
    outlets.flatMap((outlet) => [
      prisma.outletKitchen.upsert({
        where: {
          outletId_kitchenId: { outletId: outlet.id, kitchenId: primaryKitchenByBrand[outlet.brandId] },
        },
        update: {},
        create: { outletId: outlet.id, kitchenId: primaryKitchenByBrand[outlet.brandId], isPrimary: true },
      }),
      prisma.outletKitchen.upsert({
        where: { outletId_kitchenId: { outletId: outlet.id, kitchenId: centralWarehouse.id } },
        update: {},
        create: { outletId: outlet.id, kitchenId: centralWarehouse.id, isPrimary: false },
      }),
    ]),
  );

  // --- Prompt 03: tax categories, products, menus, pricing ----------------

  const [gst5, gst18] = await Promise.all([
    prisma.taxCategory.upsert({
      where: { organizationId_name: { organizationId: org.id, name: "GST 5%" } },
      update: {},
      create: { organizationId: org.id, name: "GST 5%", ratePercent: "5.00" },
    }),
    prisma.taxCategory.upsert({
      where: { organizationId_name: { organizationId: org.id, name: "GST 18%" } },
      update: {},
      create: { organizationId: org.id, name: "GST 18%", ratePercent: "18.00" },
    }),
  ]);

  async function category(brandId: string, name: string, sortOrder: number) {
    return prisma.productCategory.upsert({
      where: { brandId_name: { brandId, name } },
      update: {},
      create: { organizationId: org.id, brandId, name, sortOrder },
    });
  }

  const [beverages, snacks, pizzas, sides, cakes, pastries] = await Promise.all([
    category(oldMonk.id, "Beverages", 0),
    category(oldMonk.id, "Snacks", 1),
    category(paproni.id, "Pizzas", 0),
    category(paproni.id, "Sides", 1),
    category(bakery.id, "Cakes", 0),
    category(bakery.id, "Pastries", 1),
  ]);

  async function product(input: {
    brandId: string;
    categoryId: string;
    taxCategoryId: string;
    name: string;
    sku: string;
    variants: Array<{
      name: string;
      sku: string;
      basePrice: string;
      sortOrder: number;
      kind?: "PREPARED_FOOD" | "RETAIL_COMMODITY";
      purchasePrice?: string;
      supplierPrice?: string;
      landedCost?: string;
      printedMRP?: string;
    }>;
  }) {
    const prod = await prisma.product.upsert({
      where: { brandId_sku: { brandId: input.brandId, sku: input.sku } },
      update: {},
      create: {
        organizationId: org.id,
        brandId: input.brandId,
        categoryId: input.categoryId,
        taxCategoryId: input.taxCategoryId,
        name: input.name,
        sku: input.sku,
      },
    });
    const variants = await Promise.all(
      input.variants.map((v) =>
        prisma.productVariant.upsert({
          where: { productId_name: { productId: prod.id, name: v.name } },
          update: {},
          create: {
            productId: prod.id,
            name: v.name,
            sku: v.sku,
            basePrice: v.basePrice,
            sortOrder: v.sortOrder,
            kind: v.kind,
            purchasePrice: v.purchasePrice,
            supplierPrice: v.supplierPrice,
            landedCost: v.landedCost,
            printedMRP: v.printedMRP,
          },
        }),
      ),
    );
    return { product: prod, variants };
  }

  const filterCoffee = await product({
    brandId: oldMonk.id,
    categoryId: beverages.id,
    taxCategoryId: gst5.id,
    name: "Filter Coffee",
    sku: "OM-COFFEE",
    variants: [
      { name: "Regular", sku: "OM-COFFEE-REG", basePrice: "60.00", sortOrder: 0 },
      { name: "Large", sku: "OM-COFFEE-LRG", basePrice: "90.00", sortOrder: 1 },
    ],
  });
  const vegSandwich = await product({
    brandId: oldMonk.id,
    categoryId: snacks.id,
    taxCategoryId: gst5.id,
    name: "Veg Sandwich",
    sku: "OM-SAND",
    variants: [{ name: "Regular", sku: "OM-SAND-REG", basePrice: "120.00", sortOrder: 0 }],
  });
  const margherita = await product({
    brandId: paproni.id,
    categoryId: pizzas.id,
    taxCategoryId: gst18.id,
    name: "Margherita",
    sku: "PP-MARG",
    variants: [
      { name: "Small", sku: "PP-MARG-S", basePrice: "199.00", sortOrder: 0 },
      { name: "Medium", sku: "PP-MARG-M", basePrice: "349.00", sortOrder: 1 },
      { name: "Large", sku: "PP-MARG-L", basePrice: "499.00", sortOrder: 2 },
    ],
  });
  const garlicBread = await product({
    brandId: paproni.id,
    categoryId: sides.id,
    taxCategoryId: gst18.id,
    name: "Garlic Bread",
    sku: "PP-GARLIC",
    variants: [{ name: "Regular", sku: "PP-GARLIC-REG", basePrice: "149.00", sortOrder: 0 }],
  });
  const chocCake = await product({
    brandId: bakery.id,
    categoryId: cakes.id,
    taxCategoryId: gst18.id,
    name: "Chocolate Truffle Cake",
    sku: "BB-CHOCCAKE",
    variants: [
      { name: "500g", sku: "BB-CHOCCAKE-500", basePrice: "450.00", sortOrder: 0 },
      { name: "1kg", sku: "BB-CHOCCAKE-1000", basePrice: "850.00", sortOrder: 1 },
    ],
  });
  const croissant = await product({
    brandId: bakery.id,
    categoryId: pastries.id,
    taxCategoryId: gst5.id,
    name: "Croissant",
    sku: "BB-CROISSANT",
    variants: [{ name: "Regular", sku: "BB-CROISSANT-REG", basePrice: "80.00", sortOrder: 0 }],
  });
  // Prompt 16: pre-packaged retail commodities (bought ready to sell, not prepared from a
  // recipe) — distinct cost source (purchase/landed cost, not CostingService) and an MRP
  // ceiling a price quote may never exceed. Kept off every other spec's price-sensitive
  // assertions by giving them pricing rules scoped only to these two variants (see below).
  const bottledWater = await product({
    brandId: oldMonk.id,
    categoryId: beverages.id,
    taxCategoryId: gst18.id,
    name: "Packaged Drinking Water 500ml",
    sku: "OM-WATER500",
    variants: [
      {
        name: "500ml",
        sku: "OM-WATER500-REG",
        basePrice: "20.00",
        sortOrder: 2,
        kind: "RETAIL_COMMODITY",
        purchasePrice: "9.00",
        supplierPrice: "9.50",
        landedCost: "10.00",
        printedMRP: "20.00",
      },
    ],
  });
  const potatoChips = await product({
    brandId: paproni.id,
    categoryId: sides.id,
    taxCategoryId: gst18.id,
    name: "Potato Chips 52g",
    sku: "PP-CHIPS52",
    variants: [
      {
        name: "52g",
        sku: "PP-CHIPS52-REG",
        basePrice: "20.00",
        sortOrder: 2,
        kind: "RETAIL_COMMODITY",
        purchasePrice: "15.00",
        supplierPrice: "15.50",
        landedCost: "16.00",
        printedMRP: "20.00",
      },
    ],
  });

  async function menu(brandId: string, name: string, variantIds: string[]) {
    const m = await prisma.menu.upsert({
      where: { brandId_name: { brandId, name } },
      update: {},
      create: { organizationId: org.id, brandId, name },
    });
    await Promise.all(
      variantIds.map((variantId, i) =>
        prisma.menuItem.upsert({
          where: { menuId_variantId: { menuId: m.id, variantId } },
          update: {},
          create: { menuId: m.id, variantId, sortOrder: i },
        }),
      ),
    );
    return m;
  }

  const oldMonkVariantIds = [...filterCoffee.variants, ...vegSandwich.variants, ...bottledWater.variants].map((v) => v.id);
  const paproniVariantIds = [...margherita.variants, ...garlicBread.variants, ...potatoChips.variants].map((v) => v.id);
  const bakeryVariantIds = [...chocCake.variants, ...croissant.variants].map((v) => v.id);

  const oldMonkMenu = await menu(oldMonk.id, "Dine-in Menu", oldMonkVariantIds);
  const paproniDineInMenu = await menu(paproni.id, "Dine-in Menu", paproniVariantIds);
  const paproniDeliveryMenu = await menu(paproni.id, "Delivery Menu", paproniVariantIds);
  const bakeryMenu = await menu(bakery.id, "Dine-in Menu", bakeryVariantIds);

  const menuByBrand: Record<string, string> = {
    [oldMonk.id]: oldMonkMenu.id,
    [paproni.id]: paproniDineInMenu.id,
    [bakery.id]: bakeryMenu.id,
  };
  await Promise.all(
    outlets.map((outlet) =>
      prisma.outletMenu.upsert({
        where: { outletId_menuId: { outletId: outlet.id, menuId: menuByBrand[outlet.brandId] } },
        update: {},
        create: { outletId: outlet.id, menuId: menuByBrand[outlet.brandId], channel: "DINE_IN" },
      }),
    ),
  );
  const paproniOutlet = outlets.find((o) => o.brandId === paproni.id);
  if (paproniOutlet) {
    await prisma.outletMenu.upsert({
      where: { outletId_menuId: { outletId: paproniOutlet.id, menuId: paproniDeliveryMenu.id } },
      update: {},
      create: { outletId: paproniOutlet.id, menuId: paproniDeliveryMenu.id, channel: "DELIVERY" },
    });
  }

  // A premium outlet charging more than the brand's base price for one variant.
  const connaughtPlace = outlets.find((o) => o.code === "OM-CP-01");
  const largeCoffee = filterCoffee.variants.find((v) => v.name === "Large");
  if (connaughtPlace && largeCoffee) {
    await prisma.outletProductPrice.upsert({
      where: { outletId_variantId: { outletId: connaughtPlace.id, variantId: largeCoffee.id } },
      update: {},
      create: { organizationId: org.id, outletId: connaughtPlace.id, variantId: largeCoffee.id, price: "100.00" },
    });
  }

  // --- Prompt 04: ingredients, packaging, recipes --------------------------

  async function ingredient(name: string, sku: string, unit: string, kind: "RAW_MATERIAL" | "PACKAGING" = "RAW_MATERIAL") {
    return prisma.ingredient.upsert({
      where: { organizationId_sku: { organizationId: org.id, sku } },
      update: {},
      create: { organizationId: org.id, name, sku, unit, kind },
    });
  }

  const [
    pizzaDough,
    mozzarella,
    tomatoSauce,
    coffeeBeans,
    milk,
    breadSlice,
    butter,
    flour,
    sugar,
    darkChocolate,
    eggs,
    pizzaBoxMedium,
    coffeeCup,
    takeawayContainer,
    cakeBox,
    paperBag,
  ] = await Promise.all([
    ingredient("Pizza Dough", "ING-DOUGH", "KILOGRAM"),
    ingredient("Mozzarella Cheese", "ING-MOZZ", "KILOGRAM"),
    ingredient("Tomato Sauce", "ING-TOMSAUCE", "KILOGRAM"),
    ingredient("Coffee Beans", "ING-COFFEE", "GRAM"),
    ingredient("Milk", "ING-MILK", "MILLILITRE"),
    ingredient("Bread Slice", "ING-BREAD", "UNIT"),
    ingredient("Butter", "ING-BUTTER", "GRAM"),
    ingredient("Flour", "ING-FLOUR", "KILOGRAM"),
    ingredient("Sugar", "ING-SUGAR", "KILOGRAM"),
    ingredient("Dark Chocolate", "ING-DARKCHOC", "GRAM"),
    ingredient("Eggs", "ING-EGGS", "UNIT"),
    ingredient("Pizza Box (Medium)", "PKG-BOX-MED", "UNIT", "PACKAGING"),
    ingredient("Coffee Cup", "PKG-CUP", "UNIT", "PACKAGING"),
    ingredient("Takeaway Container", "PKG-CONTAINER", "UNIT", "PACKAGING"),
    ingredient("Cake Box", "PKG-CAKEBOX", "UNIT", "PACKAGING"),
    ingredient("Paper Bag", "PKG-PAPERBAG", "UNIT", "PACKAGING"),
  ]);

  const grillStation = await prisma.kitchenStation.findFirstOrThrow({
    where: { kitchenId: oldMonkKitchen.id, code: "GRILL-01" },
  });
  const ovenStation = await prisma.kitchenStation.findFirstOrThrow({
    where: { kitchenId: sharedKitchen.id, code: "OVEN-01" },
  });
  const bakeryStation = await prisma.kitchenStation.findFirstOrThrow({
    where: { kitchenId: sharedKitchen.id, code: "BAKE-01" },
  });

  async function recipe(input: {
    variantId: string;
    preparationStationId?: string;
    lines: Array<{ ingredientId: string; quantity: string }>;
  }) {
    const r = await prisma.recipe.upsert({
      where: { variantId: input.variantId },
      update: {},
      create: { organizationId: org.id, variantId: input.variantId, preparationStationId: input.preparationStationId },
    });
    await Promise.all(
      input.lines.map((line) =>
        prisma.recipeIngredient.upsert({
          where: { recipeId_ingredientId: { recipeId: r.id, ingredientId: line.ingredientId } },
          update: {},
          create: { recipeId: r.id, ingredientId: line.ingredientId, quantity: line.quantity },
        }),
      ),
    );
    return r;
  }

  const filterCoffeeRegular = filterCoffee.variants.find((v) => v.name === "Regular");
  const vegSandwichRegular = vegSandwich.variants.find((v) => v.name === "Regular");
  const margheritaMedium = margherita.variants.find((v) => v.name === "Medium");
  const garlicBreadRegular = garlicBread.variants.find((v) => v.name === "Regular");
  const chocCake500g = chocCake.variants.find((v) => v.name === "500g");
  const croissantRegular = croissant.variants.find((v) => v.name === "Regular");

  await Promise.all(
    [
      filterCoffeeRegular && {
        variantId: filterCoffeeRegular.id,
        lines: [
          { ingredientId: coffeeBeans.id, quantity: "18" },
          { ingredientId: milk.id, quantity: "100" },
          { ingredientId: coffeeCup.id, quantity: "1" },
        ],
      },
      vegSandwichRegular && {
        variantId: vegSandwichRegular.id,
        preparationStationId: grillStation.id,
        lines: [
          { ingredientId: breadSlice.id, quantity: "2" },
          { ingredientId: butter.id, quantity: "10" },
          { ingredientId: takeawayContainer.id, quantity: "1" },
        ],
      },
      margheritaMedium && {
        variantId: margheritaMedium.id,
        preparationStationId: ovenStation.id,
        lines: [
          { ingredientId: pizzaDough.id, quantity: "0.3" },
          { ingredientId: mozzarella.id, quantity: "0.15" },
          { ingredientId: tomatoSauce.id, quantity: "0.1" },
          { ingredientId: pizzaBoxMedium.id, quantity: "1" },
        ],
      },
      garlicBreadRegular && {
        variantId: garlicBreadRegular.id,
        preparationStationId: ovenStation.id,
        lines: [
          { ingredientId: pizzaDough.id, quantity: "0.15" },
          { ingredientId: butter.id, quantity: "20" },
          { ingredientId: takeawayContainer.id, quantity: "1" },
        ],
      },
      chocCake500g && {
        variantId: chocCake500g.id,
        preparationStationId: bakeryStation.id,
        lines: [
          { ingredientId: flour.id, quantity: "0.2" },
          { ingredientId: sugar.id, quantity: "0.15" },
          { ingredientId: darkChocolate.id, quantity: "100" },
          { ingredientId: eggs.id, quantity: "3" },
          { ingredientId: butter.id, quantity: "50" },
          { ingredientId: cakeBox.id, quantity: "1" },
        ],
      },
      croissantRegular && {
        variantId: croissantRegular.id,
        preparationStationId: bakeryStation.id,
        lines: [
          { ingredientId: flour.id, quantity: "0.08" },
          { ingredientId: butter.id, quantity: "40" },
          { ingredientId: paperBag.id, quantity: "1" },
        ],
      },
    ]
      .filter((r): r is NonNullable<typeof r> => Boolean(r))
      .map((r) => recipe(r)),
  );

  // --- Prompt 05: ingredient costs, cost history, recipe overheads --------

  async function setCost(ingredientId: string, costPerUnit: string) {
    await prisma.$transaction([
      prisma.ingredient.update({ where: { id: ingredientId }, data: { costPerUnit } }),
      prisma.ingredientCostHistory.create({ data: { ingredientId, costPerUnit } }),
    ]);
  }

  await Promise.all([
    setCost(pizzaDough.id, "60.0000"),
    setCost(mozzarella.id, "450.0000"),
    setCost(tomatoSauce.id, "80.0000"),
    setCost(coffeeBeans.id, "1.2000"),
    setCost(milk.id, "0.0600"),
    setCost(breadSlice.id, "3.0000"),
    setCost(butter.id, "0.5000"),
    setCost(flour.id, "40.0000"),
    setCost(sugar.id, "45.0000"),
    setCost(darkChocolate.id, "1.5000"),
    // Eggs is deliberately left without a cost, to demonstrate the costing
    // engine's "missing cost data" handling for the Chocolate Truffle Cake.
    setCost(pizzaBoxMedium.id, "15.0000"),
    setCost(coffeeCup.id, "3.0000"),
    setCost(takeawayContainer.id, "5.0000"),
    setCost(cakeBox.id, "20.0000"),
    setCost(paperBag.id, "2.0000"),
  ]);

  // A second cost entry for Flour (a price increase), demonstrating the
  // append-only cost history used for historical margin analysis.
  await setCost(flour.id, "44.0000");

  if (margheritaMedium) {
    const margheritaRecipe = await prisma.recipe.findUniqueOrThrow({
      where: { variantId: margheritaMedium.id },
    });
    await prisma.recipeOverheadCost.upsert({
      where: { recipeId_label: { recipeId: margheritaRecipe.id, label: "Labor" } },
      update: {},
      create: { recipeId: margheritaRecipe.id, label: "Labor", amount: "30.00" },
    });
  }
  if (chocCake500g) {
    const chocCakeRecipe = await prisma.recipe.findUniqueOrThrow({ where: { variantId: chocCake500g.id } });
    await Promise.all([
      prisma.recipeOverheadCost.upsert({
        where: { recipeId_label: { recipeId: chocCakeRecipe.id, label: "Labor" } },
        update: {},
        create: { recipeId: chocCakeRecipe.id, label: "Labor", amount: "50.00" },
      }),
      prisma.recipeOverheadCost.upsert({
        where: { recipeId_label: { recipeId: chocCakeRecipe.id, label: "Utilities" } },
        update: {},
        create: { recipeId: chocCakeRecipe.id, label: "Utilities", amount: "10.00" },
      }),
    ]);
  }

  // --- Prompt 06: POS orders ------------------------------------------------

  async function nextOrderNumber(outletId: string) {
    const sequence = await prisma.outletOrderSequence.upsert({
      where: { outletId },
      update: { lastNumber: { increment: 1 } },
      create: { outletId, lastNumber: 1 },
    });
    return sequence.lastNumber;
  }

  function lineAmounts(unitPrice: string, quantity: number, taxRatePercent: string) {
    const subtotal = Number(unitPrice) * quantity;
    const tax = Math.round(subtotal * (Number(taxRatePercent) / 100) * 100) / 100;
    return { lineSubtotal: subtotal.toFixed(2), taxAmount: tax.toFixed(2), lineTotal: (subtotal + tax).toFixed(2) };
  }

  if (connaughtPlace && filterCoffeeRegular && vegSandwichRegular) {
    const existingOpenOrder = await prisma.order.findFirst({
      where: { outletId: connaughtPlace.id, channel: "DINE_IN", status: "OPEN" },
    });
    if (!existingOpenOrder) {
      const coffeeAmounts = lineAmounts("60.00", 2, "5.00");
      const sandwichAmounts = lineAmounts("120.00", 1, "5.00");
      const subtotal = Number(coffeeAmounts.lineSubtotal) + Number(sandwichAmounts.lineSubtotal);
      const taxTotal = Number(coffeeAmounts.taxAmount) + Number(sandwichAmounts.taxAmount);

      await prisma.order.create({
        data: {
          organizationId: org.id,
          outletId: connaughtPlace.id,
          orderNumber: await nextOrderNumber(connaughtPlace.id),
          channel: "DINE_IN",
          status: "OPEN",
          subtotal: subtotal.toFixed(2),
          taxTotal: taxTotal.toFixed(2),
          total: (subtotal + taxTotal).toFixed(2),
          createdByUserId: admin.id,
          items: {
            create: [
              {
                variantId: filterCoffeeRegular.id,
                productName: "Filter Coffee",
                variantName: "Regular",
                unitPrice: "60.00",
                quantity: 2,
                taxRatePercent: "5.00",
                ...coffeeAmounts,
              },
              {
                variantId: vegSandwichRegular.id,
                productName: "Veg Sandwich",
                variantName: "Regular",
                unitPrice: "120.00",
                quantity: 1,
                taxRatePercent: "5.00",
                ...sandwichAmounts,
              },
            ],
          },
        },
      });
    }
  }

  if (paproniOutlet && margheritaMedium) {
    const existingPaidOrder = await prisma.order.findFirst({
      where: { outletId: paproniOutlet.id, channel: "DINE_IN", status: "PAID" },
    });
    if (!existingPaidOrder) {
      const pizzaAmounts = lineAmounts("349.00", 1, "18.00");
      const paidOrder = await prisma.order.create({
        data: {
          organizationId: org.id,
          outletId: paproniOutlet.id,
          orderNumber: await nextOrderNumber(paproniOutlet.id),
          channel: "DINE_IN",
          status: "PAID",
          closedAt: new Date(),
          subtotal: pizzaAmounts.lineSubtotal,
          taxTotal: pizzaAmounts.taxAmount,
          total: pizzaAmounts.lineTotal,
          createdByUserId: admin.id,
          items: {
            create: [
              {
                variantId: margheritaMedium.id,
                productName: "Margherita",
                variantName: "Medium",
                unitPrice: "349.00",
                quantity: 1,
                taxRatePercent: "18.00",
                ...pizzaAmounts,
              },
            ],
          },
        },
      });
      await prisma.payment.create({
        data: { orderId: paidOrder.id, method: "CARD", amount: pizzaAmounts.lineTotal, referenceNumber: "DEMO-CARD-001" },
      });
    }
  }

  // --- Prompt 07: kitchen display tickets ----------------------------------

  if (vegSandwichRegular) {
    const sandwichItem = await prisma.orderItem.findFirst({
      where: { variantId: vegSandwichRegular.id, order: { outletId: connaughtPlace?.id, status: "OPEN" } },
    });
    if (sandwichItem) {
      await prisma.kitchenTicketItem.upsert({
        where: { orderItemId: sandwichItem.id },
        update: {},
        create: { organizationId: org.id, orderItemId: sandwichItem.id, stationId: grillStation.id },
      });
    }
  }

  if (margheritaMedium) {
    const pizzaItem = await prisma.orderItem.findFirst({
      where: { variantId: margheritaMedium.id, order: { outletId: paproniOutlet?.id, status: "PAID" } },
    });
    if (pizzaItem) {
      const now = new Date();
      await prisma.kitchenTicketItem.upsert({
        where: { orderItemId: pizzaItem.id },
        update: {},
        create: {
          organizationId: org.id,
          orderItemId: pizzaItem.id,
          stationId: ovenStation.id,
          status: "SERVED",
          startedAt: now,
          readyAt: now,
          servedAt: now,
        },
      });
    }
  }

  // --- Prompt 08: suppliers, purchase orders, stock -----------------------

  const [freshFarms, metroPackaging] = await Promise.all([
    prisma.supplier.upsert({
      where: { organizationId_name: { organizationId: org.id, name: "Fresh Farms Produce" } },
      update: {},
      create: {
        organizationId: org.id,
        name: "Fresh Farms Produce",
        contactName: "Ravi Kumar",
        phone: "+91-9800000001",
        leadTimeDays: 2,
      },
    }),
    prisma.supplier.upsert({
      where: { organizationId_name: { organizationId: org.id, name: "Metro Packaging Co." } },
      update: {},
      create: {
        organizationId: org.id,
        name: "Metro Packaging Co.",
        contactName: "Anita Shah",
        phone: "+91-9800000002",
        leadTimeDays: 7,
      },
    }),
  ]);

  // Prompt 18: forecasting inputs — a preferred supplier to resolve lead time from, and a
  // shelf life on the perishables, so expiry-aware planning has something real to flag.
  await Promise.all([
    prisma.ingredient.update({ where: { id: pizzaDough.id }, data: { preferredSupplierId: freshFarms.id } }),
    prisma.ingredient.update({ where: { id: mozzarella.id }, data: { preferredSupplierId: freshFarms.id, shelfLifeDays: 14 } }),
    prisma.ingredient.update({ where: { id: milk.id }, data: { preferredSupplierId: freshFarms.id, shelfLifeDays: 5 } }),
  ]);

  // A 60-day synthetic consumption history for Pizza Dough at the Shared Kitchen, with a
  // deliberate weekday pattern (busier Fri-Sun) — real order traffic in this seed is far too
  // thin to give the forecasting engine's weekday/trend math anything to find, so this
  // backfills a believable ledger directly, the same "synthetic historical data for a demo"
  // tradeoff as Prompt 14/15's seeded loyalty ledger rows.
  const doughWeekdayPattern = [2, 2, 2, 2, 3, 4, 4]; // Sun..Sat, in kilograms.
  const existingDoughHistory = await prisma.stockMovement.findFirst({
    where: { kitchenId: sharedKitchen.id, ingredientId: pizzaDough.id, type: "CONSUMPTION", note: "Seeded demand history" },
  });
  if (!existingDoughHistory) {
    // A starting receipt sized comfortably above the 60-day backfill's total consumption
    // (~162kg), so the kitchen ends up with a believable "a bit under two weeks left"
    // balance rather than negative stock.
    await prisma.$transaction([
      prisma.stockMovement.create({
        data: {
          organizationId: org.id,
          kitchenId: sharedKitchen.id,
          ingredientId: pizzaDough.id,
          type: "RECEIPT",
          quantityDelta: "200",
          note: "Seeded starting stock for demand history",
          createdAt: new Date(Date.now() - 61 * 24 * 60 * 60 * 1000),
        },
      }),
      prisma.stockBalance.upsert({
        where: { kitchenId_ingredientId: { kitchenId: sharedKitchen.id, ingredientId: pizzaDough.id } },
        update: { quantityOnHand: { increment: "200" } },
        create: { organizationId: org.id, kitchenId: sharedKitchen.id, ingredientId: pizzaDough.id, quantityOnHand: "200" },
      }),
    ]);
    for (let daysAgo = 60; daysAgo >= 1; daysAgo--) {
      const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
      const quantity = doughWeekdayPattern[date.getUTCDay()] ?? 2;
      await prisma.$transaction([
        prisma.stockMovement.create({
          data: {
            organizationId: org.id,
            kitchenId: sharedKitchen.id,
            ingredientId: pizzaDough.id,
            type: "CONSUMPTION",
            quantityDelta: String(-quantity),
            note: "Seeded demand history",
            createdAt: date,
          },
        }),
        prisma.stockBalance.upsert({
          where: { kitchenId_ingredientId: { kitchenId: sharedKitchen.id, ingredientId: pizzaDough.id } },
          update: { quantityOnHand: { decrement: quantity } },
          create: { organizationId: org.id, kitchenId: sharedKitchen.id, ingredientId: pizzaDough.id, quantityOnHand: String(-quantity) },
        }),
      ]);
    }
  }

  async function nextPurchaseOrderNumber() {
    const sequence = await prisma.orgPurchaseOrderSequence.upsert({
      where: { organizationId: org.id },
      update: { lastNumber: { increment: 1 } },
      create: { organizationId: org.id, lastNumber: 1 },
    });
    return sequence.lastNumber;
  }

  async function receive(kitchenId: string, ingredientId: string, quantity: string, poItemId: string) {
    await prisma.$transaction([
      prisma.stockMovement.create({
        data: {
          organizationId: org.id,
          kitchenId,
          ingredientId,
          type: "RECEIPT",
          quantityDelta: quantity,
          referenceType: "PurchaseOrderItem",
          referenceId: poItemId,
        },
      }),
      prisma.stockBalance.upsert({
        where: { kitchenId_ingredientId: { kitchenId, ingredientId } },
        update: { quantityOnHand: { increment: quantity } },
        create: { organizationId: org.id, kitchenId, ingredientId, quantityOnHand: quantity },
      }),
    ]);
  }

  const existingFoodPo = await prisma.purchaseOrder.findFirst({
    where: { organizationId: org.id, kitchenId: centralWarehouse.id, supplierId: freshFarms.id },
  });
  if (!existingFoodPo) {
    const foodPo = await prisma.purchaseOrder.create({
      data: {
        organizationId: org.id,
        supplierId: freshFarms.id,
        kitchenId: centralWarehouse.id,
        orderNumber: await nextPurchaseOrderNumber(),
        status: "RECEIVED",
        createdByUserId: admin.id,
        items: {
          create: [
            { ingredientId: pizzaDough.id, quantityOrdered: "50", quantityReceived: "50", unitCost: "58.0000" },
            { ingredientId: mozzarella.id, quantityOrdered: "20", quantityReceived: "20", unitCost: "440.0000" },
            { ingredientId: flour.id, quantityOrdered: "30", quantityReceived: "30", unitCost: "42.0000" },
          ],
        },
      },
      include: { items: true },
    });
    for (const item of foodPo.items) {
      await receive(centralWarehouse.id, item.ingredientId, item.quantityReceived.toString(), item.id);
    }

    // A small wastage write-off against the mozzarella just received, to
    // demonstrate the stock adjustment ledger independent of receiving.
    const mozzItem = foodPo.items.find((i) => i.ingredientId === mozzarella.id);
    if (mozzItem) {
      await prisma.$transaction([
        prisma.stockMovement.create({
          data: {
            organizationId: org.id,
            kitchenId: centralWarehouse.id,
            ingredientId: mozzarella.id,
            type: "WASTAGE",
            quantityDelta: "-1",
            note: "Spoiled during storage",
          },
        }),
        prisma.stockBalance.update({
          where: { kitchenId_ingredientId: { kitchenId: centralWarehouse.id, ingredientId: mozzarella.id } },
          data: { quantityOnHand: { decrement: "1" } },
        }),
      ]);
    }

    // A reorder point on dough, so the ingredients/inventory screens have
    // something real to flag once stock runs low.
    await prisma.stockBalance.update({
      where: { kitchenId_ingredientId: { kitchenId: centralWarehouse.id, ingredientId: pizzaDough.id } },
      data: { reorderPoint: "10" },
    });
  }

  const existingPackagingPo = await prisma.purchaseOrder.findFirst({
    where: { organizationId: org.id, kitchenId: centralWarehouse.id, supplierId: metroPackaging.id },
  });
  if (!existingPackagingPo) {
    const packagingPo = await prisma.purchaseOrder.create({
      data: {
        organizationId: org.id,
        supplierId: metroPackaging.id,
        kitchenId: centralWarehouse.id,
        orderNumber: await nextPurchaseOrderNumber(),
        status: "PARTIALLY_RECEIVED",
        createdByUserId: admin.id,
        items: {
          create: [
            { ingredientId: pizzaBoxMedium.id, quantityOrdered: "200", quantityReceived: "100", unitCost: "14.0000" },
            { ingredientId: coffeeCup.id, quantityOrdered: "300", quantityReceived: "0", unitCost: "2.8000" },
          ],
        },
      },
      include: { items: true },
    });
    for (const item of packagingPo.items) {
      if (item.quantityReceived.gt(0)) {
        await receive(centralWarehouse.id, item.ingredientId, item.quantityReceived.toString(), item.id);
      }
    }
  }

  // --- Prompt 09: combos, promotions ---------------------------------------
  const pizzaGarlicCombo = await prisma.combo.upsert({
    where: { brandId_name: { brandId: paproni.id, name: "Margherita + Garlic Bread Combo" } },
    update: {},
    create: {
      organizationId: org.id,
      brandId: paproni.id,
      name: "Margherita + Garlic Bread Combo",
      description: "One Medium Margherita pizza with a side of Garlic Bread, at a bundle price.",
      comboPrice: "430.00",
    },
  });
  await Promise.all(
    [
      { variantId: margherita.variants[1]!.id, quantity: 1 },
      { variantId: garlicBread.variants[0]!.id, quantity: 1 },
    ].map((item) =>
      prisma.comboItem.upsert({
        where: { comboId_variantId: { comboId: pizzaGarlicCombo.id, variantId: item.variantId } },
        update: {},
        create: { comboId: pizzaGarlicCombo.id, variantId: item.variantId, quantity: item.quantity },
      }),
    ),
  );
  await prisma.menuComboItem.upsert({
    where: { menuId_comboId: { menuId: paproniDineInMenu.id, comboId: pizzaGarlicCombo.id } },
    update: {},
    create: { menuId: paproniDineInMenu.id, comboId: pizzaGarlicCombo.id, sortOrder: 0 },
  });

  await prisma.promotion.upsert({
    where: { organizationId_code: { organizationId: org.id, code: "WELCOME10" } },
    update: {},
    create: {
      organizationId: org.id,
      code: "WELCOME10",
      description: "10% off, organization-wide, capped at ₹100",
      type: "PERCENTAGE",
      value: "10.00",
      maxDiscountAmount: "100.00",
    },
  });
  await prisma.promotion.upsert({
    where: { organizationId_code: { organizationId: org.id, code: "FLAT50" } },
    update: {},
    create: {
      organizationId: org.id,
      brandId: oldMonk.id,
      code: "FLAT50",
      description: "₹50 off orders of ₹200 or more at Cafe Old Monk",
      type: "FLAT",
      value: "50.00",
      minOrderSubtotal: "200.00",
      usageLimit: 100,
    },
  });

  console.log(`Seeded organization "${org.name}" with admin ${adminEmail} / ChangeMe123!`);
  console.log(`Seeded 3 brands, 3 kitchens (1 shared, 1 dedicated, 1 central warehouse), 4 outlets.`);
  console.log(`Seeded 2 tax categories, 6 product categories, 6 products, 4 menus, 1 outlet price override.`);
  console.log(`Seeded 16 ingredients (11 raw materials, 5 packaging) and 6 recipes.`);
  console.log(`Seeded costs for 15 ingredients (Eggs left uncosted), 1 cost-history update, 3 recipe overheads.`);
  console.log(`Seeded 2 demo POS orders (1 open, 1 paid).`);
  console.log(`Seeded 2 kitchen tickets (1 queued at Grill, 1 served at Pizza Oven).`);
  console.log(`Seeded 2 suppliers and 2 purchase orders (1 received, 1 partially received), with stock on hand.`);
  console.log(`Seeded 1 combo (Margherita + Garlic Bread) and 2 promotion codes (WELCOME10, FLAT50).`);

  // --- Prompt 11: finance / HR / CRM ----------------------------------------
  async function employee(input: { name: string; role: string; outletId?: string; hireDate: Date }) {
    const existing = await prisma.employee.findFirst({ where: { organizationId: org.id, name: input.name } });
    if (existing) return existing;
    return prisma.employee.create({
      data: { organizationId: org.id, outletId: input.outletId, name: input.name, role: input.role, hireDate: input.hireDate },
    });
  }

  const priya = await employee({ name: "Priya Sharma", role: "Cashier", outletId: connaughtPlace?.id, hireDate: new Date("2025-01-15") });
  const rahul = await employee({ name: "Rahul Verma", role: "Outlet Manager", outletId: paproniOutlet?.id, hireDate: new Date("2024-11-01") });
  await employee({ name: "Ananya Gupta", role: "Area Manager", hireDate: new Date("2024-03-01") });

  // A closed shift for Priya (yesterday) and an open one for Rahul (still clocked in), so the
  // attendance screen has a real example of both states.
  const priyaHasAttendance = await prisma.attendance.findFirst({ where: { employeeId: priya.id } });
  if (!priyaHasAttendance) {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await prisma.attendance.create({
      data: {
        employeeId: priya.id,
        clockIn: new Date(yesterday.setHours(9, 0, 0, 0)),
        clockOut: new Date(yesterday.setHours(17, 0, 0, 0)),
      },
    });
  }
  const rahulHasOpenAttendance = await prisma.attendance.findFirst({ where: { employeeId: rahul.id, clockOut: null } });
  if (!rahulHasOpenAttendance) {
    await prisma.attendance.create({ data: { employeeId: rahul.id, clockIn: new Date() } });
  }

  async function expense(input: { category: "RENT" | "UTILITIES" | "SALARY"; description: string; amount: string; incurredAt: Date; outletId?: string }) {
    const existing = await prisma.expense.findFirst({ where: { organizationId: org.id, description: input.description } });
    if (existing) return existing;
    return prisma.expense.create({
      data: {
        organizationId: org.id,
        outletId: input.outletId,
        category: input.category,
        description: input.description,
        amount: input.amount,
        incurredAt: input.incurredAt,
        recordedByUserId: admin.id,
      },
    });
  }

  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  await expense({ category: "RENT", description: "Connaught Place outlet rent", amount: "85000.00", outletId: connaughtPlace?.id, incurredAt: lastMonth });
  await expense({ category: "UTILITIES", description: "Indiranagar outlet electricity bill", amount: "6200.00", outletId: paproniOutlet?.id, incurredAt: lastMonth });
  await expense({ category: "SALARY", description: "Head office payroll run", amount: "150000.00", incurredAt: lastMonth });

  // Sneha is created first so she can be Vikram's referrer below.
  const sneha = await prisma.customer.upsert({
    where: { organizationId_phone: { organizationId: org.id, phone: "+91-9822222222" } },
    update: {},
    create: { organizationId: org.id, name: "Sneha Iyer", phone: "+91-9822222222", notes: "Prefers takeaway; regular at Indiranagar." },
  });
  const vikram = await prisma.customer.upsert({
    where: { organizationId_phone: { organizationId: org.id, phone: "+91-9811111111" } },
    update: { birthday: new Date(Date.UTC(1990, 2, 15)), referredByCustomerId: sneha.id },
    create: {
      organizationId: org.id,
      name: "Vikram Singh",
      phone: "+91-9811111111",
      email: "vikram.singh@example.com",
      birthday: new Date(Date.UTC(1990, 2, 15)),
      referredByCustomerId: sneha.id,
    },
  });

  // Link Vikram to the seeded paid pizza order (Prompt 06) and credit the loyalty points it would
  // have earned, via a real EARN ledger transaction — not a direct balance increment — so the
  // ledger stays the one and only source of truth, even for this historical seed-time credit.
  if (paproniOutlet) {
    // Matches either the not-yet-linked order (first ever seed run) or the already-linked one
    // (a reseed) — otherwise a reseed's `customerId: null` filter would never find it again
    // once Vikram was linked, silently skipping the credit below on every run after the first.
    const paidOrder = await prisma.order.findFirst({
      where: { outletId: paproniOutlet.id, status: "PAID", OR: [{ customerId: null }, { customerId: vikram.id }] },
    });
    if (paidOrder) {
      await prisma.order.update({ where: { id: paidOrder.id }, data: { customerId: vikram.id } });
      const alreadyCredited = await prisma.loyaltyTransaction.findFirst({ where: { orderId: paidOrder.id, type: "EARN" } });
      if (!alreadyCredited) {
        const points = paidOrder.total.div(100).floor().toNumber();
        await prisma.$transaction(async (tx) => {
          const updated = await tx.customer.update({
            where: { id: vikram.id },
            data: { loyaltyPoints: { increment: points }, lifetimePoints: { increment: points } },
          });
          await tx.loyaltyTransaction.create({
            data: {
              organizationId: org.id,
              customerId: vikram.id,
              type: "EARN",
              points,
              balanceAfter: updated.loyaltyPoints,
              orderId: paidOrder.id,
            },
          });
        });
      }
    }
  }

  console.log(`Seeded 3 employees (1 with a closed shift, 1 still clocked in), 3 expenses, and 2 customers (1 linked to the paid order, 1 referring the other).`);

  // --- Prompt 14: loyalty & rewards engine ----------------------------------
  await prisma.loyaltyProgramSettings.upsert({
    where: { organizationId: org.id },
    update: {},
    create: {
      organizationId: org.id,
      earningRate: "1",
      redemptionRatio: "1",
      welcomeBonusPoints: 20,
      referralBonusPoints: 50,
      birthdayBonusPoints: 25,
      pointsExpiryDays: 365,
    },
  });

  async function loyaltyTier(input: { name: string; minLifetimePoints: number; earningMultiplier: string; sortOrder: number }) {
    return prisma.loyaltyTier.upsert({
      where: { organizationId_name: { organizationId: org.id, name: input.name } },
      update: {},
      create: { organizationId: org.id, ...input },
    });
  }
  await loyaltyTier({ name: "Silver", minLifetimePoints: 0, earningMultiplier: "1", sortOrder: 0 });
  await loyaltyTier({ name: "Gold", minLifetimePoints: 500, earningMultiplier: "1.5", sortOrder: 1 });
  await loyaltyTier({ name: "Platinum", minLifetimePoints: 2000, earningMultiplier: "2", sortOrder: 2 });

  console.log(`Seeded loyalty program settings, 3 membership tiers (Silver/Gold/Platinum), and gave Vikram a birthday + a referral link to Sneha.`);

  // --- Prompt 13: customer communication engine -----------------------------
  async function communicationTemplate(input: {
    brandId?: string;
    channel: "WHATSAPP" | "SMS";
    purpose: "TRANSACTIONAL" | "PROMOTIONAL";
    key: string;
    name: string;
    body: string;
    providerTemplateName?: string;
  }) {
    const existing = await prisma.communicationTemplate.findFirst({
      where: { organizationId: org.id, channel: input.channel, key: input.key, brandId: input.brandId ?? null },
    });
    if (existing) return existing;
    return prisma.communicationTemplate.create({
      data: {
        organizationId: org.id,
        brandId: input.brandId,
        channel: input.channel,
        purpose: input.purpose,
        key: input.key,
        name: input.name,
        body: input.body,
        providerTemplateName: input.providerTemplateName,
      },
    });
  }

  await communicationTemplate({
    channel: "WHATSAPP",
    purpose: "TRANSACTIONAL",
    key: "order_confirmation",
    name: "Order confirmation (WhatsApp)",
    body: "Thanks for ordering from {{brand}} at {{outlet}}! Order #{{orderNumber}}: {{items}}. Total: ₹{{total}} ({{paymentStatus}}). Loyalty points: {{loyaltyPoints}}.",
    providerTemplateName: "order_confirmation_v1",
  });
  await communicationTemplate({
    channel: "SMS",
    purpose: "TRANSACTIONAL",
    key: "order_confirmation",
    name: "Order confirmation (SMS)",
    body: "{{brand}} ({{outlet}}): order #{{orderNumber}} for Rs.{{total}} is {{paymentStatus}}. Points: {{loyaltyPoints}}.",
  });
  // Pizza Paproni gets its own WhatsApp wording — demonstrates a brand-specific template
  // taking priority over the organization-wide default of the same key/channel.
  await communicationTemplate({
    brandId: paproni.id,
    channel: "WHATSAPP",
    purpose: "TRANSACTIONAL",
    key: "order_confirmation",
    name: "Order confirmation (WhatsApp, Pizza Paproni)",
    body: "🍕 Pizza Paproni ({{outlet}}) order #{{orderNumber}} confirmed: {{items}}. Total ₹{{total}} — {{paymentStatus}}. You earned {{loyaltyPoints}} points!",
    providerTemplateName: "paproni_order_confirmation_v1",
  });
  await communicationTemplate({
    channel: "WHATSAPP",
    purpose: "TRANSACTIONAL",
    key: "order_status_update",
    name: "Order voided (WhatsApp)",
    body: "Your order #{{orderNumber}} at {{brand}} ({{outlet}}) was voided. Please contact the outlet if this is unexpected.",
    providerTemplateName: "order_status_update_v1",
  });
  const weekendSpecialTemplate = await communicationTemplate({
    channel: "WHATSAPP",
    purpose: "PROMOTIONAL",
    key: "weekend_special",
    name: "Weekend special (WhatsApp)",
    body: "{{brand}} weekend special: flat 20% off this Saturday & Sunday at {{outlet}}. See you there!",
    providerTemplateName: "weekend_special_v1",
  });

  // Vikram has opted in to WhatsApp marketing (recorded at checkout); Sneha has opted out of
  // SMS entirely — two real examples of the consent/opt-out states the preferences screen shows.
  await prisma.customerCommunicationPreference.upsert({
    where: { customerId_channel: { customerId: vikram.id, channel: "WHATSAPP" } },
    update: {},
    create: {
      customerId: vikram.id,
      channel: "WHATSAPP",
      marketingOptIn: true,
      consentSource: "pos_checkout",
      consentGivenAt: new Date(),
      consentGivenByUserId: admin.id,
    },
  });
  await prisma.customerCommunicationPreference.upsert({
    where: { customerId_channel: { customerId: sneha.id, channel: "SMS" } },
    update: {},
    create: { customerId: sneha.id, channel: "SMS", transactionalOptIn: false, marketingOptIn: false, optedOutAt: new Date() },
  });

  console.log(`Seeded 5 communication templates (order confirmation on WhatsApp+SMS, a Pizza Paproni override, order-voided and weekend-special) and 2 customer preference rows.`);

  // --- Prompt 15: WhatsApp marketing automation ----------------------------
  async function segment<T extends { name: string } & Record<string, unknown>>(input: T) {
    return prisma.customerSegment.upsert({
      where: { organizationId_name: { organizationId: org.id, name: input.name } },
      update: {},
      create: { organizationId: org.id, ...input },
    });
  }

  const everyoneSegment = await segment({ name: "Everyone", type: "ALL" });
  await segment({ name: "Inactive 90+ days", type: "INACTIVE", inactiveDays: 90 });
  await segment({ name: "Prefers Pizza Paproni", type: "BRAND_PREFERENCE", brandId: paproni.id });

  const existingCampaign = await prisma.campaign.findFirst({ where: { organizationId: org.id, name: "Weekend Combo Blast" } });
  if (!existingCampaign) {
    await prisma.campaign.create({
      data: {
        organizationId: org.id,
        name: "Weekend Combo Blast",
        type: "WEEKEND_COMBO",
        segmentId: everyoneSegment.id,
        status: "DRAFT",
        createdByUserId: admin.id,
        variants: {
          create: [{ name: "A", templateId: weekendSpecialTemplate.id, trafficPercent: 100 }],
        },
      },
    });
  }

  console.log(`Seeded 3 customer segments (Everyone, Inactive 90+ days, Prefers Pizza Paproni) and 1 draft campaign (Weekend Combo Blast).`);

  // --- Prompt 16: dynamic pricing engine ------------------------------------
  // Every rule below is scoped to one of the two new retail-commodity variants
  // (Packaged Drinking Water, Potato Chips) so this seed never perturbs the
  // fixed order totals other prompts' e2e specs assert against prepared-food
  // variants (Margherita, Croissant, Filter Coffee, ...). PricingSettings is
  // deliberately left at its default (minimumMarginPercent 0, auto-created on
  // first read) for the same reason — the feature exists and is reachable via
  // its own endpoint, but stays inert until an admin actually configures it.
  const bottledWaterVariant = bottledWater.variants[0];
  const potatoChipsVariant = potatoChips.variants[0];

  async function pricingRule(input: {
    variantId: string;
    outletId?: string;
    channel?: "DINE_IN" | "DELIVERY" | "TAKEAWAY";
    category: "TIME_BASED" | "WEEKEND" | "FESTIVAL" | "CHANNEL" | "OUTLET" | "SCHEDULED_DISCOUNT" | "DEMAND_BASED";
    label: string;
    daysOfWeek?: number[];
    startTime?: string;
    endTime?: string;
    validFrom?: Date;
    validTo?: Date;
    adjustmentType: "FIXED_PRICE" | "PERCENT_DISCOUNT" | "FLAT_DISCOUNT" | "PERCENT_SURCHARGE" | "FLAT_SURCHARGE";
    adjustmentValue: string;
    priority?: number;
  }) {
    const existing = await prisma.pricingRule.findFirst({ where: { organizationId: org.id, label: input.label } });
    if (existing) return existing;
    return prisma.pricingRule.create({
      data: { organizationId: org.id, ...input, daysOfWeek: input.daysOfWeek ?? [], priority: input.priority ?? 0 },
    });
  }

  if (bottledWaterVariant && potatoChipsVariant) {
    await pricingRule({
      variantId: bottledWaterVariant.id,
      category: "WEEKEND",
      label: "Weekend water demand surcharge",
      daysOfWeek: [0, 6],
      adjustmentType: "PERCENT_SURCHARGE",
      adjustmentValue: "10.00",
    });
    await pricingRule({
      variantId: bottledWaterVariant.id,
      category: "TIME_BASED",
      label: "Late-night water discount",
      startTime: "22:00",
      endTime: "06:00",
      adjustmentType: "FLAT_DISCOUNT",
      adjustmentValue: "2.00",
      priority: 1,
    });
    if (paproniOutlet) {
      await pricingRule({
        variantId: potatoChipsVariant.id,
        outletId: paproniOutlet.id,
        category: "OUTLET",
        label: "Indiranagar chips outlet promo",
        adjustmentType: "FLAT_DISCOUNT",
        adjustmentValue: "3.00",
        priority: 2,
      });
    }
    await pricingRule({
      variantId: potatoChipsVariant.id,
      category: "CHANNEL",
      label: "Delivery packaging surcharge on chips",
      channel: "DELIVERY",
      adjustmentType: "FLAT_SURCHARGE",
      adjustmentValue: "5.00",
    });
    await pricingRule({
      variantId: potatoChipsVariant.id,
      category: "FESTIVAL",
      label: "Diwali 2025 chips offer",
      validFrom: new Date("2025-10-20T00:00:00Z"),
      validTo: new Date("2025-10-21T23:59:59Z"),
      adjustmentType: "PERCENT_DISCOUNT",
      adjustmentValue: "15.00",
    });
  }

  console.log(
    "Seeded 2 retail-commodity products (Packaged Drinking Water, Potato Chips) with purchase/supplier/landed cost and printed MRP, and 5 pricing rules (weekend, midnight, outlet, channel, festival).",
  );

  console.log(
    "Seeded supplier lead times (Fresh Farms 2 days, Metro Packaging 7 days), preferred suppliers + shelf life on Pizza Dough/Mozzarella/Milk, and 60 days of synthetic Pizza Dough consumption history at the Shared Kitchen for the forecasting engine.",
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
