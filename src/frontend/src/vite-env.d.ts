/// <reference types="vite/client" />

// Type definition for vite-plugin-svgr default behavior (named export)
declare module "*.svg" {
  import * as React from "react";

  export const ReactComponent: React.FunctionComponent<React.SVGProps<SVGSVGElement> & { title?: string }>;

  const src: string;
  export default src; // Keep default export for URL usage if needed elsewhere
}

// Keep the type definition for ?react suffix in case it's used elsewhere or for clarity
// Although it seems not to be working correctly in this setup.
declare module "*.svg?react" {
  import * as React from "react";

  const ReactComponent: React.FunctionComponent<React.SVGProps<SVGSVGElement> & { title?: string }>;

  export default ReactComponent;
}

// Add type definition for ?raw imports
declare module "*.svg?raw" {
  const content: string;
  export default content;
}

// Add declaration for the problematic "?import" suffix seen in the error
declare module "*.svg?import" {
  import * as React from "react";

  export const ReactComponent: React.FunctionComponent<React.SVGProps<SVGSVGElement> & { title?: string }>;

  const src: string;
  export default src;
}
