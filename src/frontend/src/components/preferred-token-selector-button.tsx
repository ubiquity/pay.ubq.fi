import React, { useEffect, useMemo, useRef, useState } from "react";
import { Address } from "viem";
import { getSupportedRewardTokensForChain, getTokenInfo } from "../constants/supported-reward-tokens";
import { ICONS } from "./iconography";
import { RewardPreferenceSelector } from "./reward-preference-selector";

const LOCAL_STORAGE_KEY = "preferredRewardToken";

interface PreferredTokenSelectorButtonProps {
  readonly chainId: number | undefined;
  readonly onPreferenceChange: (selectedAddress: Address | null) => void; // Callback for parent
}

export function PreferredTokenSelectorButton({ chainId, onPreferenceChange }: PreferredTokenSelectorButtonProps) {
  const [isDropdownVisible, setIsDropdownVisible] = useState(false);
  const [currentPreference, setCurrentPreference] = useState<Address | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null); // Ref for the wrapper div
  const buttonRef = useRef<HTMLButtonElement>(null); // Ref for the button

  // Get available tokens based on the current chainId
  const availableTokens = useMemo(() => {
    return getSupportedRewardTokensForChain(chainId);
  }, [chainId]);

  // Load and validate preference from localStorage on mount or when chain/available tokens change
  useEffect(() => {
    const storedPreference = localStorage.getItem(LOCAL_STORAGE_KEY) as Address | null;
    if (storedPreference && availableTokens.some((token) => token.address.toLowerCase() === storedPreference.toLowerCase())) {
      setCurrentPreference(storedPreference);
    } else {
      setCurrentPreference(null);
      if (storedPreference) {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      }
    }
  }, [availableTokens]);

  // Effect to handle clicks outside the dropdown using capture phase
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsDropdownVisible(false);
      }
    }
    if (isDropdownVisible) {
      document.addEventListener("click", handleClickOutside, true);
    } else {
      document.removeEventListener("click", handleClickOutside, true);
    }
    return () => {
      document.removeEventListener("click", handleClickOutside, true);
    };
  }, [isDropdownVisible]);

  // Button click toggles dropdown and stops propagation
  const toggleDropdown = (event: React.MouseEvent) => {
    event.stopPropagation();
    setIsDropdownVisible((prev) => !prev); // Use toggle based on previous state
  };

  // Internal handler for changes from the actual dropdown
  const handleInternalPreferenceChange = (selectedAddress: Address | null) => {
    if (selectedAddress !== currentPreference) {
      // Check if value actually changed
      setCurrentPreference(selectedAddress);
      setIsDropdownVisible(false);
      onPreferenceChange(selectedAddress);
    } else {
      // If same value selected, just close without notifying parent
      setIsDropdownVisible(false);
    }
  };

  // Determine which icon to display
  const displayIcon = useMemo(() => {
    if (currentPreference) {
      const tokenInfo = getTokenInfo(chainId, currentPreference);
      const iconKey = tokenInfo?.symbol.toUpperCase() as keyof typeof ICONS;
      if (tokenInfo && ICONS[iconKey]) {
        return ICONS[iconKey];
      }
    }
    // Default: Use a generic icon or text
    return ICONS.SWAP; // Alternative default
  }, [currentPreference, chainId]);

  return (
    <div className="preferred-token-selector-button-wrapper" ref={wrapperRef}>
      <button ref={buttonRef} onClick={toggleDropdown} className="preferred-token-button" title="Select Preferred Reward Token">
        {displayIcon}
      </button>
      {isDropdownVisible && (
        <div className="preference-dropdown-container">
          <RewardPreferenceSelector chainId={chainId} onPreferenceChange={handleInternalPreferenceChange} />
        </div>
      )}
    </div>
  );
}
