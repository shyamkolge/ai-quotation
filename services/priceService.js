function calculatePricing(products) {
  let subtotal = 0;
  let totalStandardDiscount = 0;
  let totalAdditionalDiscount = 0;
  let cgst = 0;
  let sgst = 0;

  products.forEach(p => {
    const quantity = p.quantity;
    const unitPrice = p.base_price;

    const grossLineTotal = unitPrice * quantity;

    // 🔹 Percentage discounts
    const standardDiscountPercent = p.standard_discount || 0;
    const additionalDiscountPercent = p.additional_discount || 0;

    const standardDiscountAmount =
      (grossLineTotal * standardDiscountPercent) / 100;

    const additionalDiscountAmount =
      (grossLineTotal * additionalDiscountPercent) / 100;

    const netLineTotal =
      grossLineTotal - standardDiscountAmount - additionalDiscountAmount;

    subtotal += netLineTotal;
    totalStandardDiscount += standardDiscountAmount;
    totalAdditionalDiscount += additionalDiscountAmount;

    // 🔹 GST calculation (tax_rate = total GST %)
    const totalGST = (netLineTotal * p.tax_rate) / 100;

    cgst += totalGST / 2;
    sgst += totalGST / 2;
  });

  const total = subtotal + cgst + sgst;

  return {
    subtotal: Number(subtotal.toFixed(2)),
    standardDiscount: Number(totalStandardDiscountAmount.toFixed(2)),
    additionalDiscount: Number(totalAdditionalDiscountAmount.toFixed(2)),
    cgst: Number(cgst.toFixed(2)),
    sgst: Number(sgst.toFixed(2)),
    total: Number(total.toFixed(2))
  };
}

module.exports = { calculatePricing };
