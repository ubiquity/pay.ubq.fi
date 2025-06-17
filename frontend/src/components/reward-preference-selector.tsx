import React, { useState, useEffect, useMemo } from "react";
import { Address } from "viem";
// RewardTokenInfo is implicitly used by getSupportedRewardTokensForChain return type
import { getSupportedRewardTokensForChain } from "../constants/supported-reward-tokens";

const LOCAL_STORAGE_KEY = "preferredRewardToken";

interface RewardPreferenceSelectorProps {
  chainId: number | undefined;
  onPreferenceChange: (selectedAddress: Address | null) => void; // Callback for parent
}

export function RewardPreferenceSelector({ chainId, onPreferenceChange }: RewardPreferenceSelectorProps) {
  const [selectedTokenAddress, setSelectedTokenAddress] = useState<Address | null>(null);

  // Get available tokens based on the current chainId
  const availableTokens = useMemo(() => {
    return getSupportedRewardTokensForChain(chainId);
  }, [chainId]);

  useEffect(() => {
    // Load preference from localStorage on mount or when chain changes
    const storedPreference = localStorage.getItem(LOCAL_STORAGE_KEY) as Address | null;

    // Validate stored preference against available tokens for the current chain
    if (storedPreference && availableTokens.some((token) => token.address.toLowerCase() === storedPreference.toLowerCase())) {
      setSelectedTokenAddress(storedPreference);
      // DO NOT notify parent on initial load, only set local state.
      // onPreferenceChange(storedPreference); // Removed this call
    } else {
      // Clear selection if no preference stored or if stored preference is not valid for the current chain
      setSelectedTokenAddress(null);
      // Only remove invalid preference if one was actually stored
      if (storedPreference) {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      }
      // DO NOT notify parent on initial load/clear.
      // onPreferenceChange(null); // Removed this call
    }
    // Rerun effect when availableTokens list changes (which depends on chainId)
    // Removed onPreferenceChange from dependency array as it's no longer called here
  }, [availableTokens]);

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newAddress = event.target.value as Address | ""; // Cast empty string possibility
    const finalAddress = newAddress === "" ? null : newAddress; // Convert empty string to null

    setSelectedTokenAddress(finalAddress);

    if (finalAddress) {
      localStorage.setItem(LOCAL_STORAGE_KEY, finalAddress);
    } else {
      // Handle case where user selects the default "-- Select --" option
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
    // Trigger callback to notify parent component (e.g., DashboardPage)
    onPreferenceChange(finalAddress);
    console.log(`Preferred reward token set to: ${finalAddress || "None"}`);
  };

  // Disable selector if no tokens are available for the current chain
  const isDisabled = availableTokens.length === 0;

  // Removed unused stopPropagation function definition

  return (
    // Removed onClick handler from the container div
    <div className="reward-preference-selector">
      {/* <label htmlFor="reward-token-select">Preferred Reward Token: </label> */}
      <select
        id="reward-token-select"
        value={selectedTokenAddress || ""}
        onChange={handleChange}
        disabled={isDisabled}
        title={isDisabled ? "No supported reward tokens found for this network" : "Select your preferred token for receiving rewards (or claim original)"}
      >
        <option value="">Claim Original Token</option>
        {availableTokens.map((token) => (
          <option key={token.address} value={token.address}>
            Claim in {token.symbol}
          </option>
        ))}
      </select>
      {isDisabled && chainId && <span style={{ marginLeft: "10px", fontStyle: "italic" }}>(Not available on this network)</span>}
    </div>
  );
}
