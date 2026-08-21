export function getNetworkSwitchParams(chainId: number) {
	return {
		method: "wallet_switchEthereumChain",
		params: [{ chainId: `0x${chainId.toString(16)}` }],
	};
}
