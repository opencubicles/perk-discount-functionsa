import {
  DiscountClass,
  OrderDiscountSelectionStrategy,
  ProductDiscountSelectionStrategy,
} from '../generated/api';


/**
  * @typedef {import("../generated/api").CartInput} RunInput
  * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
  */

/**
  * @param {RunInput} input
  * @returns {CartLinesDiscountsGenerateRunResult}
  */

function applyBundleDiscount(input) {
  const discounts = [];
  const kitsArray = {};

  for (const line of input.cart.lines) {
    if (line.merchandise?.product?.hasAnyKitsTag) {
      kitsArray[line.id] = line; // ✅ FIXED
    }
  }

  if (!Object.keys(kitsArray).length) {
    return { operations: [] };
  }

  for (const id in kitsArray) {
    const line = kitsArray[id];

    const { amountPerQuantity } = line.cost;
    const quantity = line.quantity;

    const finalPrice = parseFloat(line.merchandise.product.metafield1?.value || 0);
    const saleDiscount = parseFloat(
      line.merchandise.product.sale_discount?.value || 0
    );
    const lineItemPrice = parseFloat(amountPerQuantity.amount);

    let finalDiscount = 0;

    if (saleDiscount > 0) {
      if (saleDiscount < 1) {
        finalDiscount = lineItemPrice * saleDiscount; //sale discount if in decimal then percentage discount 
      } else {
        finalDiscount = saleDiscount;
      }
    }
    console.log("finalDiscount", finalDiscount);
    if (finalDiscount > 0) {
      discounts.push({
        message: "Bundle Discount",
        targets: [{ cartLine: { id, quantity } }], // ✅ now valid
        value: {
          fixedAmount: {
            amount: finalDiscount.toString(),
            appliesToEachItem: true,
          },
        },
      });
    }
  }

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates: discounts,
          selectionStrategy: ProductDiscountSelectionStrategy.All,
        },
      },
    ],
  };
}

function applyPerkC25Discount(input) {
  let chinosQty = 0;
  let chinosLines = [];

  for (const line of input.cart.lines) {
    const product = line.merchandise?.product;
    if (!product) continue;

    if (product.hasChinosTag) {
      chinosLines.push(line);
      chinosQty += line.quantity;
    }
  }

  if (chinosQty >= 3) {
    let candidates = chinosLines.map(line => ({
      message: "Perk-C25OFF",
      targets: [{ cartLine: { id: line.id } }],
      value: {
        percentage: { value: 25 },
      },
    }));

    return {
      operations: [
        {
          productDiscountsAdd: {
            candidates,
            selectionStrategy: ProductDiscountSelectionStrategy.All,
          },
        },
      ],
    };
  }

  return { operations: [] };
}

function applyPerkOfferDiscount(input) {
  let chinosLines = [];
  let beltLine = null;
  let chinosQty = 0;

  for (const line of input.cart.lines) {
    const product = line.merchandise?.product;
    if (!product) continue;

    if (product.hasChinosTag) {
      chinosLines.push(line);
      chinosQty += line.quantity;
    }

    if (product.hasBeltTag) {
      beltLine = line;
    }
  }

  if (chinosQty <= 1) {
    return { operations: [] };
  }

  let candidates = [];
  let fixedDiscount = 0;
  let percentageDiscount = null;
  let giveFreeBelt = false;

  if (chinosQty === 2) {
    fixedDiscount = 38;
  } else if (chinosQty === 3) {
    fixedDiscount = 90;
    giveFreeBelt = true;
  } else if (chinosQty === 4) {
    fixedDiscount = 137;
    giveFreeBelt = true;
  } else if (chinosQty === 5) {
    fixedDiscount = 186;
    giveFreeBelt = true;
  } else if (chinosQty === 6) {
    fixedDiscount = 237;
    giveFreeBelt = true;
  } else if (chinosQty > 6) {
    percentageDiscount = 30;
    giveFreeBelt = true;
  }

  // ✅ Percentage case
  if (percentageDiscount) {
    for (const line of chinosLines) {
      candidates.push({
        message: "Perk Offer",
        targets: [{ cartLine: { id: line.id } }],
        value: {
          percentage: { value: percentageDiscount },
        },
      });
    }
  }

  // ✅ Fixed distribution case
  else if (fixedDiscount > 0) {
    let remaining = fixedDiscount;

    chinosLines.forEach((line, index) => {
      let amount;

      if (index === chinosLines.length - 1) {
        amount = remaining;
      } else {
        amount =
          Math.round((line.quantity / chinosQty) * fixedDiscount * 100) / 100;
        remaining -= amount;
      }

      candidates.push({
        message: "Perk Offer",
        targets: [{ cartLine: { id: line.id } }],
        value: {
          fixedAmount: { amount },
        },
      });
    });
  }

  // ✅ Free belt
  if (giveFreeBelt && beltLine) {
    candidates.push({
      message: "Free Belt",
      targets: [{ cartLine: { id: beltLine.id, quantity: 1 } }],
      value: {
        percentage: { value: 100 },
      },
    });
  }

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates,
          selectionStrategy: ProductDiscountSelectionStrategy.All,
        },
      },
    ],
  };
}

export function cartLinesDiscountsGenerateRun(input) {
  console.log("input.cart.igTestGroups", input.cart.igTestGroups);

  let igTestGroups = input.cart.igTestGroups?.value ?? '';
  const coupon_code_from_metafield =
    input?.discount?.discountMetafield?.value ?? "";

  // fallback from line
  if (!igTestGroups) {
    for (const line of input.cart.lines) {
      if (line?.igTestGroupsLine) {
        igTestGroups = line.igTestGroupsLine;
        break;
      }
    }
  }

  console.log("coupon_code_from_metafield", coupon_code_from_metafield);

  let operations = [];

  if (coupon_code_from_metafield == "Bundle Discount") {
    const bundleOperation = applyBundleDiscount(input);

    if (bundleOperation) {
      operations.push(...bundleOperation.operations); // ✅ FIXED
    }
  } 
  else if (coupon_code_from_metafield == "Perk-C25OFF" && !igTestGroups?.split(",").includes("05ed7d3c232d")) {
    const res = applyPerkC25Discount(input);
    operations.push(...res.operations);
  } 
  else if (
    coupon_code_from_metafield == "Perk Offer" &&
    igTestGroups?.split(",").includes("05ed7d3c232d")
  ) {
    const res = applyPerkOfferDiscount(input);
    operations.push(...res.operations);
  }

  return { operations };
}