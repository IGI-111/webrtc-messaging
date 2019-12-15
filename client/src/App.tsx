import React, { KeyboardEvent, ChangeEvent, Component } from 'react'
import MessageInterface from './MessageInterface'

function getSignalWebSocket(): Promise<WebSocket> {
  return new Promise(function(resolve, reject) {
    const server = new WebSocket('ws://vps514782.ovh.net:3012')
    server.onopen = () => {
      resolve(server)
    }
    server.onerror = err => {
      reject(err)
    }
  })
}

class App extends Component<
  {},
  {
    sock?: WebSocket
    conn: RTCPeerConnection
    id?: string
    connectingTo?: string
    connectedTo?: string
    connectionTarget?: string
    dataChannel?: RTCDataChannel
    messageHistory: string[]
  }
> {
  constructor(props: {}) {
    super(props)

    const conn = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:vps514782.ovh.net' }],
    })

    this.state = {
      messageHistory: [],
      conn,
    }
  }

  setupWebSocket = async () => {
    const { conn } = this.state
    const sock = await getSignalWebSocket()

    conn.onicecandidate = (e: RTCPeerConnectionIceEvent) => {
      if (e.candidate) {
        sock.send(
          `ICE ${this.state.id} ${this.state.connectingTo} ${JSON.stringify(
            e.candidate,
          )}`,
        )
      } else {
        console.log('No more ICE candidates')
      }
    }

    conn.ondatachannel = (e: RTCDataChannelEvent) => {
      const dataChannel = e.channel
      dataChannel.onmessage = this.receiveMessage
      dataChannel.onopen = () =>
        this.setState({ connectedTo: this.state.connectingTo })
      this.setState({ dataChannel })
    }

    sock.onmessage = async (e: MessageEvent) => {
      if (!this.state.id) {
        this.setState({ id: e.data })
      } else {
        console.log('Received', e.data)

        const { conn, id } = this.state
        const [verb, source, dest] = e.data.split(' ', 3)
        const arg = e.data
          .split(' ')
          .slice(3)
          .join(' ')
        if (dest !== id) {
          throw new Error('Received message not adressed to us')
        }

        switch (verb) {
          case 'OFFER': {
            const sdp = JSON.parse(arg)
            const remote = new RTCSessionDescription(sdp)
            this.setState({ connectingTo: source }, async () => {
              await conn.setRemoteDescription(remote)
              const answer = await conn.createAnswer()
              await conn.setLocalDescription(answer)
              sock.send(`ANSWER ${id} ${source} ${JSON.stringify(answer)}`)
            })
            break
          }
          case 'ANSWER': {
            const sdp = JSON.parse(arg)
            const remote = new RTCSessionDescription(sdp)
            await conn.setRemoteDescription(remote)
            break
          }
          case 'ICE': {
            const candidate = JSON.parse(arg)
            await conn.addIceCandidate(candidate)
            break
          }
        }
      }
    }
    this.setState({ sock })
  }

  async componentDidMount() {
    this.setupWebSocket()
  }

  setConnectionTarget = (e: ChangeEvent<HTMLInputElement>) => {
    this.setState({ connectionTarget: e.target.value })
  }

  startConnection = async () => {
    this.setState({ connectingTo: this.state.connectionTarget }, async () => {
      const { id, conn, sock, connectingTo } = this.state

      const dataChannel = conn.createDataChannel('DATACHANNEL')
      dataChannel.onmessage = this.receiveMessage
      dataChannel.onopen = () =>
        this.setState({ connectedTo: this.state.connectingTo })
      this.setState({ dataChannel })

      if (!sock) {
        throw new Error('Signalling socket not up')
      }
      const offer = await conn.createOffer({ iceRestart: true })
      await conn.setLocalDescription(offer)
      sock.send(`OFFER ${id} ${connectingTo} ${JSON.stringify(offer)}`)
    })
  }

  sendMessage = async (message: string) => {
    const { dataChannel } = this.state
    if (!dataChannel) {
      throw new Error('Data Channel not up')
    }
    dataChannel.send(message)
    this.setState({
      messageHistory: [...this.state.messageHistory, message],
    })
  }

  receiveMessage = (message: MessageEvent) => {
    this.setState({
      messageHistory: [...this.state.messageHistory, message.data],
    })
    console.log('Message', message)
  }

  render() {
    const { sock, connectedTo, messageHistory } = this.state
    if (connectedTo) {
      return (
        <div className="App">
          <h1>
            You are {this.state.id}, connected to {connectedTo}
          </h1>
          <MessageInterface
            onSend={this.sendMessage}
            messageHistory={messageHistory}
          />
        </div>
      )
    } else {
      return (
        <div className="App">
          <h1>You are {this.state.id}</h1>
          {sock && (
            <div>
              <input
                onChange={this.setConnectionTarget}
                onKeyPress={(e: KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === 'Enter') {
                    this.startConnection()
                  }
                }}
              />
              <button onClick={this.startConnection}>Connect</button>
            </div>
          )}
        </div>
      )
    }
  }
}

export default App
