import { ethers } from 'ethers';
import DAI_ABI from './dai.abi.json';

// Replace with your own values
const privateKey = 'YOUR_PRIVATE_KEY';
const daiContractAddress = 'DAI_CONTRACT_ADDRESS';
const ownerAddress = 'OWNER_ADDRESS';
const spenderAddress = '0x336C033842FA316d470e820c81b742e62A0765DC'; // rndquu
const amount = ethers.utils.parseUnits('100', 18);
const deadline = Math.floor(Date.now() / 1000) + 3600; // Expires in 1 hour

async function generatePermit() {
  const provider = new ethers.providers.JsonRpcProvider();
  const wallet = new ethers.Wallet(privateKey, provider);
  const daiContract = new ethers.Contract(daiContractAddress, DAI_ABI, wallet);

  const nonce = await daiContract.nonces(ownerAddress);
  const chainId = (await provider.getNetwork()).chainId;

  const domainSeparator = ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
      [
        ethers.utils.keccak256(ethers.utils.toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),
        ethers.utils.keccak256(ethers.utils.toUtf8Bytes('Dai Stablecoin')),
        ethers.utils.keccak256(ethers.utils.toUtf8Bytes('1')),
        chainId,
        daiContractAddress
      ]
    )
  );

  const message = {
    owner: ownerAddress,
    spender: spenderAddress,
    value: amount.toString(),
    nonce: nonce.toString(),
    deadline: deadline.toString(),
    tokenAddress: daiContractAddress
  };

  const types = {
    Permit: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' }
    ]
  };

  const messageHash = ethers.utils.keccak256(
    ethers.utils.solidityPack(
      ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
      [
        '0x19',
        '0x01',
        domainSeparator,
        ethers.utils.keccak256(
          ethers.utils.defaultAbiCoder.encode(
            types['Permit'],
            [message.owner, message.spender, message.value, message.nonce, message.deadline]
          )
        )
      ]
    )
  );

  const signature = await wallet.signMessage(ethers.utils.arrayify(messageHash));

  console.log('Message:', message);
  console.log('Signature:', signature);
}

generatePermit();
