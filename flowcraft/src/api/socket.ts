/**
 * WebSocket Connection Manager
 * 管理與後端的 Socket.IO 連線
 */

import { io, Socket } from 'socket.io-client'

class SocketManager {
  private static instance: SocketManager
  private socket: Socket | null = null

  private constructor() {}

  static getInstance(): SocketManager {
    if (!SocketManager.instance) {
      SocketManager.instance = new SocketManager()
    }
    return SocketManager.instance
  }

  connect(url: string = 'http://localhost:3001'): Socket {
    if (this.socket?.connected) {
      return this.socket
    }

    this.socket = io(url, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    })

    this.socket.on('connect', () => {
      console.log('[Socket] Connected:', this.socket?.id)
    })

    this.socket.on('disconnect', () => {
      console.log('[Socket] Disconnected')
    })

    this.socket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error)
    })

    return this.socket
  }

  getSocket(): Socket | null {
    return this.socket
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
  }
}

export const socketManager = SocketManager.getInstance()
