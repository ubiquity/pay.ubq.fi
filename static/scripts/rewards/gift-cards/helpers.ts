import ct from "countries-and-timezones";

declare const BACKEND_URL: string;

export function getApiBaseUrl() {
  return BACKEND_URL;
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

export async function isReloadlySandbox() {
  const response = await fetch(`${getApiBaseUrl()}/get-cards-env`);
  if (response.status == 200) {
    const responseJson = await response.json();
    return responseJson.USE_RELOADLY_SANDBOX === "true";
  }
  return false;
}

export async function detectCardsEnv() {
  const isCardsSandbox = await isReloadlySandbox();
  if (isCardsSandbox) {
    const cardEnvElement = document.createElement("div");
    cardEnvElement.setAttribute("class", "cards-env");
    cardEnvElement.textContent = "You are using Reloadly Sandbox.";
    const footer = document.getElementsByTagName("footer");
    if (footer.length) {
      footer[0].parentNode?.insertBefore(cardEnvElement, footer[0].nextSibling);
    }
  }
}
