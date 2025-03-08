/// <reference types="cypress" />

declare namespace Cypress {
  interface Chainable {
    getPermitUrl(permitConfig: PermitConfig): Promise<string>;
  }
}
