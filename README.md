# Kaikas Web3 Provider 

To integrate Kaikas Web extension wallet into Dapps that utilize ethereum based APIs, this package provides functions that handle `eth` namespace APIs using the corresponding `klay` namespace APIs.

## Installation 
```bash
npm install --save @klaytn/kaikas-web3-provider
# OR
yarn add @klaytn/kaikas-web3-provider
```

## Example (Web3Modal)

Using this Provider with the [Web3Modal](https://github.com/WalletConnect/web3modal) library, users can easily integrate Kaikas as like other wallets. 
```typescript
import Web3 from "web3";
import Web3Modal from "web3modal";
import { KaikasWeb3Provider } from "@klaytn/kaikas-web3-provider"

const providerOptions = {
  kaikas: {
    package: KaikasWeb3Provider // required
  }
};

web3Modal = new Web3Modal({
    providerOptions: providerOptions //required
});

const provider = await web3Modal.connect();

const web3 = new Web3(provider);
```