import React, { createContext, useContext, useState, useEffect } from 'react'
import fetch from 'isomorphic-unfetch'
// import regeneratorRuntime from 'regenerator-runtime'
import ws from 'isomorphic-ws'
import { authExchange } from '@urql/exchange-auth'
import {
  dedupExchange,
  // debugExchange,
  cacheExchange,
  fetchExchange,
  subscriptionExchange,
  Provider,
  createClient,
} from 'urql'
import { SubscriptionClient } from 'subscriptions-transport-ws'

export function generateUrqlClient(
  auth,
  gqlEndpoint,
  // headers, //do we still need them? see addAuthToOperation()
  publicRole = 'public'
) {
  const ssr = typeof window === 'undefined'
  const getAuth = () => {
    if (!auth.isAuthenticated()) {
      const token = auth.getJWTToken()
      const refreshToken = !ssr && localStorage.getItem('refresh_token')
      if (token && refreshToken) {
        console.log('getAuth -> token', token)
        console.log('getAuth -> refreshToken', refreshToken)
        return { token, refreshToken }
      }
      return null
    }
    // we could try a refresh token mutation/operation
    // if auth.refreshToken() would be a public function

    // const result = await auth.refreshToken(authState.refreshToken)
    // if (result) {
    //   return
    // }
    // else we logout
    // auth.logout()

    return null
  }
  const addAuthToOperation = ({ operation }) => {
    const fetchOptions =
      typeof operation.context.fetchOptions === 'function'
        ? operation.context.fetchOptions()
        : operation.context.fetchOptions || {}
    return {
      ...operation,
      context: {
        ...operation.context,
        fetchOptions: {
          ...fetchOptions,
          headers: !auth.isAuthenticated()
            ? {
                ...fetchOptions.headers,
                role: publicRole,
              }
            : {
                ...fetchOptions.headers,
                Authorization: `Bearer ${auth.getJWTToken()}`,
              },
        },
      },
    }
  }
  const didAuthError = ({ error }) => {
    return error.graphQLErrors.some((e) => e.extensions?.code === 'FORBIDDEN')
  }
  // const ssr = typeof window === 'undefined'
  const uri = gqlEndpoint

  const wsUri = uri.startsWith('https')
    ? uri.replace(/^https/, 'wss')
    : uri.replace(/^http/, 'ws')

  const subscriptionClient = new SubscriptionClient(
    wsUri,
    {
      reconnect: true,
      connectionParams: {
        headers: !auth.isAuthenticated()
          ? { role: publicRole }
          : { Authorization: `Bearer ${auth.getJWTToken()}` },
      },
    },
    ws
  )

  const client = createClient({
    url: uri,
    fetch,
    requestPolicy: 'cache-and-network',
    exchanges: [
      dedupExchange,
      // debugExchange,
      cacheExchange,
      authExchange({
        getAuth,
        addAuthToOperation,
        didAuthError,
      }),
      fetchExchange,
      subscriptionExchange({
        forwardSubscription(operation) {
          return subscriptionClient.request(operation)
        },
      }),
    ],
  })

  return client
}

export function NhostUrqlProvider(props) {
  const { auth, gqlEndpoint, publicRole = 'public', children } = props
  const client = generateUrqlClient(auth, gqlEndpoint, publicRole)
  // i think this is no longer needed.

  //   if (props.auth) {
  //     this.props.auth.onTokenChanged(() => {
  //       if (this.wsLink.subscriptionClient.status === 1) {
  //         this.wsLink.subscriptionClient.tryReconnect()
  //       }
  //     })

  //     this.props.auth.onAuthStateChanged((data) => {
  //       // reconnect ws connection with new auth headers for the logged in/out user
  //       if (this.wsLink.subscriptionClient.status === 1) {
  //         // must close first to avoid race conditions
  //         this.wsLink.subscriptionClient.close()
  //         // reconnect
  //         this.wsLink.subscriptionClient.tryReconnect()
  //       }
  //     })
  //   }
  // }

  return <Provider value={client}>{children}</Provider>
}

export const AuthContext = createContext({ signedIn: null })

export function NhostAuthProvider({ auth, children }) {
  const [signedIn, setSignedIn] = useState(auth.isAuthenticated())
  useEffect(() => {
    auth.onAuthStateChanged((data) => {
      setSignedIn(data)
    })
  }, [auth.onAuthStateChanged])

  return (
    <AuthContext.Provider value={{ signedIn }}>{children}</AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  return context
}
