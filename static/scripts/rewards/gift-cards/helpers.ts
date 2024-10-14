import ct from "countries-and-timezones";

export function getApiBaseUrl() {
  // specify when backend functions and frontend are deployed to a different URL
  return "";
}

async function getCountryCodeByIp() {
  try {
    const response = await fetch("https://ipinfo.io/json");
    if (!response.ok) {
      throw new Error(`Response status: ${response.status}`);
    }
    const json = await response.json();
    return json.country;
  } catch (error) {
    console.error(error);
    return null;
  }
}

async function getCountryCodeByTimezone() {
  const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const countries = ct.getCountriesForTimezone(localTimezone);
  return countries[0]?.id;
}

export async function getUserCountryCode() {
  const methods = [getCountryCodeByIp, getCountryCodeByTimezone];
  for (let i = 0; i < methods.length; ++i) {
    const countryCode = await methods[i]();
    if (countryCode) {
      return countryCode;
    }
  }
  return null;
}
