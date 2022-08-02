// Copyright (c) 2018-2022 Coinbase, Inc. <https://www.coinbase.com/>
// Licensed under the Apache License, version 2.0
// This file is derived from coinbase-wallet-sdk/packages/wallet-sdk/src/provider/CoinbaseWalletProvider.ts (2022/08/01).
// Modified for the kaikas-web3-provider development.

import { Web3Provider, RequestArguments } from './Web3Provider';
import SafeEventEmitter from '@metamask/safe-event-emitter';
import { JSONRPCResponse, JSONRPCRequest, JSONRPCMethod } from './JSONRPC';
import { ethErrors } from 'eth-rpc-errors';
import Caver from 'caver-js';
import { SubscriptionManager, SubscriptionNotification, SubscriptionResult } from './SubscriptionManager';

export type Callback<T> = (err: Error | null, result: T | null) => void;

interface WatchAssetParams {
  type: string;
  options: {
    address: string;
    symbol?: string;
    decimals?: number;
    image?: string;
  };
}

export class KaikasWeb3Provider extends SafeEventEmitter implements Web3Provider {
  public kaikasProvider: any;
  public chainId: string;
  public caver: any;

  private _addresses: string[] = [];
  private readonly _subscriptionManager = new SubscriptionManager(this);

  constructor(provider: any) {
    super();
    this.getChainId = this.getChainId.bind(this);
    this.enable = this.enable.bind(this);
    this.send = this.send.bind(this);
    this.sendAsync = this.sendAsync.bind(this);
    this.request = this.request.bind(this);
    this.kaikasProvider = provider;
    this.chainId = this.getChainId();
    this.caver = new Caver(provider);
    this.kaikasProvider.on('networkChanged', (params: any) => {
      this.emit('networkChanged', params);
    });
    this.kaikasProvider.on('accountsChanged', (params: any) => {
      this.emit('accountsChanged', params);
    });

    this._subscriptionManager.events.on('notification', (notification: SubscriptionNotification) => {
      this.emit('message', {
        type: notification.method,
        data: notification.params,
      });
    });
  }

  public async enable(): Promise<string[]> {
    if (this._addresses.length > 0) {
      return [...this._addresses];
    }

    const res = await this.kaikasProvider.enable();
    this._addresses = res;
    return res;
  }

  public getChainId(): string {
    const chainIdStr = this.kaikasProvider.networkVersion;
    return chainIdStr;
  }

  public get isKaikas(): boolean {
    return true;
  }

  public get connected(): boolean {
    return true;
  }

  public supportsSubscriptions(): boolean {
    return false;
  }

  public disconnect(): boolean {
    return true;
  }

  public send(request: JSONRPCRequest): JSONRPCResponse;
  public send(request: JSONRPCRequest[]): JSONRPCResponse[];
  public send(request: JSONRPCRequest, callback: Callback<JSONRPCResponse>): void;
  public send(request: JSONRPCRequest[], callback: Callback<JSONRPCResponse[]>): void;
  public send<T = any>(method: string, params?: any[] | any): Promise<T>;
  public send(
    requestOrMethod: JSONRPCRequest | JSONRPCRequest[] | string,
    callbackOrParams?: Callback<JSONRPCResponse> | Callback<JSONRPCResponse[]> | any[] | any,
  ): JSONRPCResponse | JSONRPCResponse[] | void | Promise<any> {
    // send<T>(method, params): Promise<T>
    if (typeof requestOrMethod === 'string') {
      const method = requestOrMethod;
      const params = Array.isArray(callbackOrParams)
        ? callbackOrParams
        : callbackOrParams !== undefined
        ? [callbackOrParams]
        : [];
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: 0,
        method,
        params,
      };
      return this._sendRequestAsync(request).then((res) => res.result);
    }

    // send(JSONRPCRequest | JSONRPCRequest[], callback): void
    if (typeof callbackOrParams === 'function') {
      const request = requestOrMethod as any;
      const callback = callbackOrParams;
      return this._sendAsync(request, callback);
    }

    // send(JSONRPCRequest[]): JSONRPCResponse[]
    if (Array.isArray(requestOrMethod)) {
      const requests = requestOrMethod;
      return requests.map((r) => this._sendRequest(r));
    }

    // send(JSONRPCRequest): JSONRPCResponse
    const req: JSONRPCRequest = requestOrMethod;
    return this._sendRequest(req);
  }

  public sendAsync(request: JSONRPCRequest, callback: Callback<JSONRPCResponse>): void;
  public sendAsync(request: JSONRPCRequest[], callback: Callback<JSONRPCResponse[]>): void;
  public async sendAsync(
    request: JSONRPCRequest | JSONRPCRequest[],
    callback: Callback<JSONRPCResponse> | Callback<JSONRPCResponse[]>,
  ): Promise<void> {
    if (typeof callback !== 'function') {
      throw new Error('callback is required');
    }

    // send(JSONRPCRequest[], callback): void
    if (Array.isArray(request)) {
      const arrayCb = callback as Callback<JSONRPCResponse[]>;
      this._sendMultipleRequestsAsync(request)
        .then((responses) => arrayCb(null, responses))
        .catch((err) => arrayCb(err, null));
      return;
    }

    // send(JSONRPCRequest, callback): void
    const cb = callback as Callback<JSONRPCResponse>;
    return this._sendRequestAsync(request)
      .then((response) => cb(null, response))
      .catch((err) => cb(err, null));
  }

  public async request<T>(args: RequestArguments): Promise<T> {
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      throw ethErrors.rpc.invalidRequest({
        message: 'Expected a single, non-array, object argument.',
        data: args,
      });
    }

    const { method, params } = args;

    if (typeof method !== 'string' || method.length === 0) {
      throw ethErrors.rpc.invalidRequest({
        message: "'args.method' must be a non-empty string.",
        data: args,
      });
    }

    if (params !== undefined && !Array.isArray(params) && (typeof params !== 'object' || params === null)) {
      throw ethErrors.rpc.invalidRequest({
        message: "'args.params' must be an object or array if provided.",
        data: args,
      });
    }

    const newParams = params === undefined ? [] : params;

    // Coinbase Wallet Requests
    const res = await this._sendRequestAsync({
      method,
      params: newParams,
      jsonrpc: '2.0',
      id: 0,
    });
    return res.result as T;
  }

  private _send = this.send.bind(this);
  private _sendAsync = this.sendAsync.bind(this);

  private _sendRequest(request: JSONRPCRequest): JSONRPCResponse {
    const response: JSONRPCResponse = {
      jsonrpc: '2.0',
      id: request.id,
    };
    const { method } = request;

    response.result = this._handleSynchronousMethods(request);

    if (response.result === undefined) {
      throw new Error(
        `Kaikas Wallet does not support calling ${method} synchronously without ` +
          `a callback. Please provide a callback parameter to call ${method} ` +
          `asynchronously.`,
      );
    }
    return response;
  }

  private _sendRequestAsync(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    return new Promise<JSONRPCResponse>((resolve, reject) => {
      try {
        const syncResult = this._handleSynchronousMethods(request);
        if (syncResult !== undefined) {
          return resolve({
            jsonrpc: '2.0',
            id: request.id,
            result: syncResult,
          });
        }

        const subscriptionPromise = this._handleSubscriptionMethods(request);
        if (subscriptionPromise !== undefined) {
          subscriptionPromise
            .then((res) =>
              resolve({
                jsonrpc: '2.0',
                id: request.id,
                result: res.result,
              }),
            )
            .catch((err) => reject(err));
          return;
        }
      } catch (err: any) {
        return reject(err);
      }

      this._handleAsynchronousMethods(request)
        .then((res) => res && resolve({ ...res, id: request.id }))
        .catch((err) => reject(err));
    });
  }

  private _handleSubscriptionMethods(request: JSONRPCRequest): Promise<SubscriptionResult> | undefined {
    switch (request.method) {
      case JSONRPCMethod.eth_subscribe:
      case JSONRPCMethod.eth_unsubscribe:
        return this._subscriptionManager.handleRequest(request);
    }

    return undefined;
  }
  private _sendMultipleRequestsAsync(requests: JSONRPCRequest[]): Promise<JSONRPCResponse[]> {
    return Promise.all(requests.map((r) => this._sendRequestAsync(r)));
  }

  private _handleSynchronousMethods(request: JSONRPCRequest) {
    const { method } = request;

    switch (method) {
      case JSONRPCMethod.eth_accounts:
        return this._eth_accounts();

      case JSONRPCMethod.net_version:
        return this._net_version();

      case JSONRPCMethod.eth_chainId:
        return this._eth_chainId();

      default:
        return undefined;
    }
  }

  private _eth_accounts(): string[] {
    return [...this._addresses];
  }

  private _eth_chainId(): string {
    return this.getChainId();
  }

  private _net_version(): number {
    return parseInt(this.kaikasProvider.networkVersion, 10);
  }

  private async _handleAsynchronousMethods(request: JSONRPCRequest): Promise<JSONRPCResponse | void> {
    const { method } = request;
    const params = request.params || [];
    switch (method) {
      case JSONRPCMethod.personal_sign:
        return this._personal_sign(params);

      case JSONRPCMethod.personal_ecRecover:
        return this._personal_ecRecover(params);

      case JSONRPCMethod.eth_signTransaction:
        return this._eth_signTransaction(params);

      case JSONRPCMethod.eth_sendRawTransaction:
        return this._eth_sendRawTransaction(params);

      case JSONRPCMethod.eth_sendTransaction:
        return this._eth_sendTransaction(params);

      case JSONRPCMethod.eth_blockNumber:
        return this._eth_blockNumber(params);

      case JSONRPCMethod.eth_getBlockByNumber:
        return this._eth_getBlockByNumber(params);

      case JSONRPCMethod.eth_getGasPrice:
        return this._eth_getGasPrice(params);

      case JSONRPCMethod.wallet_watchAsset:
        return this._wallet_watchAsset(params);

      case JSONRPCMethod.eth_getTransactionReceipt:
        return this._eth_getTransactionReceipt(params);

      case JSONRPCMethod.eth_call:
        return this._eth_call(params);
    }

    return this.kaikasProvider.sendAsync(request);
  }

  private async _eth_call(params: unknown[]): Promise<JSONRPCResponse> {
    return new Promise<JSONRPCResponse>((resolve, reject) => {
      this.kaikasProvider.sendAsync(
        {
          method: 'klay_call',
          params: [params[0], params[1]],
        },
        (err: any, result: any) => {
          if (result.result) {
            resolve(result);
          } else {
            reject(err);
          }
        },
      );
    });
  }

  private async _eth_getGasPrice(params: unknown): Promise<JSONRPCResponse> {
    const result = await this.caver.rpc.klay.getGasPrice();
    return { jsonrpc: '2.0', id: 0, result: result };
  }

  private async _wallet_watchAsset(params: unknown): Promise<JSONRPCResponse> {
    const request = (Array.isArray(params) ? params[0] : params) as WatchAssetParams;

    console.log('watch asset', params, request);
    if (!request.type) {
      throw ethErrors.rpc.invalidParams({
        message: 'Type is required',
      });
    }

    if (request?.type !== 'ERC20') {
      throw ethErrors.rpc.invalidParams({
        message: `Asset of type '${request.type}' is not supported`,
      });
    }

    if (!request?.options) {
      throw ethErrors.rpc.invalidParams({
        message: 'Options are required',
      });
    }

    if (!request?.options.address) {
      throw ethErrors.rpc.invalidParams({
        message: 'Address is required',
      });
    }
    const { address, symbol, image, decimals } = request.options;

    const res = await this.watchAsset(request.type, address, symbol, decimals, image);

    return { jsonrpc: '2.0', id: 0, result: res };
  }

  private async watchAsset(
    type: string,
    address: string,
    symbol?: string,
    decimals?: number,
    image?: string,
  ): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      this.kaikasProvider.sendAsync(
        {
          method: 'wallet_watchAsset',
          params: {
            type,
            options: {
              address,
              symbol,
              decimals,
              image,
            },
          },
        },
        (err: any, result: any) => {
          if (result.result) {
            resolve(!!result.result);
          } else {
            reject(err);
          }
        },
      );
    });
  }

  private async _personal_sign(params: unknown[]): Promise<JSONRPCResponse> {
    const signedMessage = await this.caver.klay.sign(params[0], params[1]);
    return { jsonrpc: '2.0', id: 0, result: signedMessage };
  }

  private async _eth_sendTransaction(params: unknown[]): Promise<JSONRPCResponse> {
    try {
      // gas(=gasLimit) is required. Sender, receiver, gas, value are required.
      // If gasPrice is undefined, eth_sendTransaction calls eth_gasPrice API before sending tx.
      const res = await this.caver.klay.sendTransaction(params[0]);
      return { jsonrpc: '2.0', id: 0, result: res.transactionHash };
    } catch (err: any) {
      if (typeof err.message === 'string' && err.message.match(/(denied|rejected)/i)) {
        throw ethErrors.provider.userRejectedRequest('User denied transaction signature');
      }
      throw err;
    }
  }

  private async _eth_signTransaction(params: unknown[]): Promise<JSONRPCResponse> {
    try {
      const res = await this.caver.klay.signTransaction(params[0]);
      return { jsonrpc: '2.0', id: 0, result: res };
    } catch (err: any) {
      if (typeof err.message === 'string' && err.message.match(/(denied|rejected)/i)) {
        throw ethErrors.provider.userRejectedRequest('User denied transaction signature');
      }
      throw err;
    }
  }

  private async _eth_sendRawTransaction(params: unknown[]): Promise<JSONRPCResponse> {
    const res = await this.caver.klay.sendTransaction({
      senderRawTransaction: params[0],
      feePayer: this.kaikasProvider.selectedAddress,
    });
    return { jsonrpc: '2.0', id: 0, result: res.transactionHash };
  }

  private async _eth_getTransactionReceipt(params: any): Promise<JSONRPCResponse> {
    const receipt = await this.caver.rpc.klay.getTransactionReceipt(params[0]);
    return { jsonrpc: '2.0', id: 0, result: receipt };
  }

  private async _personal_ecRecover(params: unknown[]): Promise<JSONRPCResponse> {
    const address = await this.caver.utils.recover(params[0], params[1]);
    return { jsonrpc: '2.0', id: 0, result: address };
  }

  private async _eth_blockNumber(params: unknown[]): Promise<JSONRPCResponse> {
    const blockNumber = await this.caver.rpc.klay.getBlockNumber();
    return { jsonrpc: '2.0', id: 0, result: blockNumber };
  }

  private async _eth_getBlockByNumber(params: any): Promise<JSONRPCResponse> {
    const block = await this.caver.rpc.klay.getBlockByNumber(params[0], params[1]);
    return { jsonrpc: '2.0', id: 0, result: block };
  }
}
