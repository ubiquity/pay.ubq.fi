/**
 * Manual Verification Browser Script
 *
 * This script uses the Puppeteer library to open a browser and fill out the contract
 * verification form on Gnosisscan, automating most of the manual verification process.
 *
 * Usage:
 *   bun run scripts/manual-verify-browser.js
 *
 * Note: You'll still need to solve the CAPTCHA manually.
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

// Target contract address
const CONTRACT_ADDRESS = "0xfa3b31d5B9F91C78360D618B5D6e74cBe930E10e";

// Verification parameters
const VERIFICATION_PARAMS = {
  contractName: "PermitAggregator",
  compilerVersion: "v0.8.20+commit.a1b79de6",
  optimizationEnabled: true,
  optimizationRuns: 200,
  constructorArguments: "000000000000000000000000000000000022d473030f116ddee9f6b43ac78ba3",
  licenseType: "MIT License", // 3
};

async function main() {
  console.log("Launching browser for manual verification assistance...");
  console.log(`Target contract: ${CONTRACT_ADDRESS}`);

  // Read contract source code
  const contractPath = path.join(__dirname, '..', 'contracts', 'PermitAggregator.sol');
  const sourceCode = fs.readFileSync(contractPath, 'utf8');
  console.log(`Contract source code loaded from ${contractPath}`);

  // Launch browser
  const browser = await puppeteer.launch({
    headless: false, // Show browser for interaction
    defaultViewport: null,
    args: ['--start-maximized']
  });

  try {
    const page = await browser.newPage();
    console.log("Navigating to Gnosisscan verification page...");

    // Navigate to the verification page
    await page.goto(`https://gnosisscan.io/address/${CONTRACT_ADDRESS}#code`);
    console.log("Waiting for page to load...");

    // Wait for page to load
    await page.waitForSelector('a:contains("Verify and Publish")', { timeout: 10000 });

    // Click on "Verify and Publish" link
    await page.click('a:contains("Verify and Publish")');
    console.log("Clicked 'Verify and Publish' link");

    // Wait for verification form to load
    await page.waitForSelector('#frmVerifyContract', { timeout: 10000 });
    console.log("Verification form loaded");

    // Fill form fields
    console.log("Filling verification form...");

    // Contract name
    await page.type('#ctl00_ContentPlaceHolder1_txtContractName', VERIFICATION_PARAMS.contractName);

    // Select compiler type
    await page.select('#ctl00_ContentPlaceHolder1_ddlCompilerType', '0'); // Solidity (Single file)

    // Select compiler version
    await page.select('#ctl00_ContentPlaceHolder1_ddlCompilerVersion', VERIFICATION_PARAMS.compilerVersion);

    // Select license type
    await page.select('#ctl00_ContentPlaceHolder1_ddlLicenseType', '3'); // MIT License

    // Select optimization
    if (VERIFICATION_PARAMS.optimizationEnabled) {
      await page.click('#ctl00_ContentPlaceHolder1_chkOptimization');
    }

    // Optimization runs
    await page.type('#ctl00_ContentPlaceHolder1_txtRuns', VERIFICATION_PARAMS.optimizationRuns.toString());

    // Enter source code
    await page.type('#ctl00_ContentPlaceHolder1_txtSourceCode', sourceCode);

    // Enter constructor arguments
    await page.type('#ctl00_ContentPlaceHolder1_txtConstructorArguements', VERIFICATION_PARAMS.constructorArguments);

    console.log("Form filled successfully");
    console.log("\n=========================================");
    console.log("IMPORTANT: Please complete the CAPTCHA manually and click 'Verify and Publish'");
    console.log("The browser will remain open for you to complete the process");
    console.log("=========================================\n");

    // Wait for user to manually complete CAPTCHA and submit
    await page.waitForNavigation({ timeout: 300000 }); // 5 minutes timeout

    // Check for successful verification
    const content = await page.content();
    if (content.includes("Contract Source Code Verified")) {
      console.log("\n✅ Contract successfully verified!");
    } else {
      console.log("\n⚠️ Verification may have failed or is still processing.");
      console.log("Please check the browser for more details.");
    }

    // Keep browser open for user to see results
    console.log("\nBrowser will remain open for you to view the results.");
    console.log("Press Ctrl+C in the terminal to close the browser.");

    // Wait for manual termination
    await new Promise(resolve => {});

  } catch (error) {
    console.error(`Error during verification: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
  } finally {
    // Browser will stay open due to the infinite promise above
    // Only closed when user terminates the script
  }
}

// Run the script
main().catch(console.error);
