// Copyright (c) 2018-2022 Coinbase, Inc. <https://www.coinbase.com/>
// Licensed under the Apache License, version 2.0
// This file is derived from coinbase-wallet-sdk/packages/wallet-sdk/src/provider/Web3Provider.ts (2022/08/01).
// Modified for the kaikas-web3-provider development.

import { Callback } from './types';
import { JSONRPCRequest, JSONRPCResponse } from './JSONRPC';

export interface Web3Provider {
  send(request: JSONRPCRequest): JSONRPCResponse;
  send(request: JSONRPCRequest[]): JSONRPCResponse[];
  send(request: JSONRPCRequest, callback: Callback<JSONRPCResponse>): void;
  send(request: JSONRPCRequest[], callback: Callback<JSONRPCResponse[]>): void;
  send<T = any>(method: string, params?: any[] | any): Promise<T>;

  sendAsync(request: JSONRPCRequest, callback: Callback<JSONRPCResponse>): void;
  sendAsync(request: JSONRPCRequest[], callback: Callback<JSONRPCResponse[]>): void;

  request<T>(args: RequestArguments): Promise<T>;

  // host: string;
  connected: boolean;
  chainId: string;
  supportsSubscriptions(): boolean;
  disconnect(): boolean;
}

export interface RequestArguments {
  /** The RPC method to request. */
  method: string;

  /** The params of the RPC method, if any. */
  params?: any;
}
