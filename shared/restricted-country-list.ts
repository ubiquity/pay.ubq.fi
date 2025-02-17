export function isRestricted(countryCode: string): boolean {
  // The restricted list is only for visa 18736
  // But the list is superset of other country lists for all other cards
  // That is why we treat it as a general restricted list for all cards
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
