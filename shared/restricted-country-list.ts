export function isRestricted(countryCode: string, sku: number): boolean {
  // The restricted list only available for 18736 at this time
  if (sku != 18736) {
    throw new Error("Invalid SKU");
  }
  const restrictedCountries: Record<string, string> = {
    AF: "Afghanistan",
    BY: "Belarus",
    BA: "Bosnia and Herzegovina",
    MM: "Burma (Myanmar)",
    CM: "Cameroon",
    CF: "Central African Republic",
    CU: "Cuba",
    CD: "Democratic Republic of the Congo",
    IR: "Iran",
    IQ: "Iraq",
    LB: "Lebanon",
    LY: "Libya",
    ML: "Mali",
    MZ: "Mozambique",
    NI: "Nicaragua",
    NG: "Nigeria",
    KP: "North Korea",
    PA: "Panama",
    RU: "Russia",
    SO: "Somalia",
    SS: "South Sudan",
    SD: "Sudan",
    SY: "Syria",
    UA: "Ukraine",
    VE: "Venezuela",
    YE: "Yemen",
    ZW: "Zimbabwe",
  };

  return Object.hasOwn(restrictedCountries, countryCode);
}
