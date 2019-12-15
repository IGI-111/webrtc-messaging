const BACKEND_ADDRESS = 'vps514782.ovh.net'
const SIGNAL_PORT = '3012'

export default class MessagingService {
  private sock: WebSocket
  private conn: RTCPeerConnection
  private id?: string
  private connectingTo?: string
  private dataChannel?: RTCDataChannel
  private receiveMessage: (e: MessageEvent) => void = () => {}
  private onConnected: (to: string) => void = () => {}
  private onOpen: (myId: string) => void = () => {}

  public constructor({
    receiveMessage,
    onConnected,
    onOpen,
  }: {
    receiveMessage: (e: MessageEvent) => void
    onConnected: (to: string) => void
    onOpen: (myId: string) => void
  }) {
    this.conn = new RTCPeerConnection({
      iceServers: [{ urls: `stun:${BACKEND_ADDRESS}` }],
    })
    this.sock = new WebSocket(`ws://${BACKEND_ADDRESS}:${SIGNAL_PORT}`)
    if (receiveMessage) {
      this.receiveMessage = receiveMessage
    }
    if (onConnected) {
      this.onConnected = onConnected
    }
    if (onOpen) {
      this.onOpen = onOpen
    }

    this.conn.onicecandidate = (e: RTCPeerConnectionIceEvent) => {
      if (e.candidate) {
        this.sock.send(
          `ICE ${this.id} ${this.connectingTo} ${JSON.stringify(e.candidate)}`,
        )
      } else {
        console.debug('No more ICE candidates')
      }
    }
    this.conn.ondatachannel = (e: RTCDataChannelEvent) => {
      const dataChannel = e.channel
      dataChannel.onmessage = this.receiveMessage
      dataChannel.onopen = () => {
        if (this.onConnected) {
          this.onConnected(this.connectingTo!)
        }
      }
      this.dataChannel = dataChannel
    }

    this.sock.onmessage = async (e: MessageEvent) => {
      if (!this.id) {
        this.id = e.data
        this.onOpen(e.data)
      } else {
        console.debug('Received', e.data)

        const [verb, source, dest] = e.data.split(' ', 3)
        const arg = e.data
          .split(' ')
          .slice(3)
          .join(' ')
        if (dest !== this.id) {
          throw new Error('Received message not adressed to us')
        }

        switch (verb) {
          case 'OFFER': {
            const sdp = JSON.parse(arg)
            const remote = new RTCSessionDescription(sdp)
            this.connectingTo = source
            await this.conn.setRemoteDescription(remote)
            const answer = await this.conn.createAnswer()
            await this.conn.setLocalDescription(answer)
            this.sock.send(
              `ANSWER ${this.id} ${source} ${JSON.stringify(answer)}`,
            )
            break
          }
          case 'ANSWER': {
            const sdp = JSON.parse(arg)
            const remote = new RTCSessionDescription(sdp)
            await this.conn.setRemoteDescription(remote)
            break
          }
          case 'ICE': {
            const candidate = JSON.parse(arg)
            await this.conn.addIceCandidate(candidate)
            break
          }
        }
      }
    }
  }
  public async connect(target: string) {
    this.connectingTo = target

    const dataChannel = this.conn.createDataChannel('DATACHANNEL')
    dataChannel.onmessage = this.receiveMessage
    dataChannel.onopen = () => {
      if (this.onConnected) {
        this.onConnected(this.connectingTo!)
      }
    }
    this.dataChannel = dataChannel

    if (!this.sock) {
      throw new Error('Signalling socket not up')
    }
    const offer = await this.conn.createOffer({ iceRestart: true })
    await this.conn.setLocalDescription(offer)
    this.sock.send(
      `OFFER ${this.id} ${this.connectingTo} ${JSON.stringify(offer)}`,
    )
  }

  public async send(message: string) {
    if (!this.dataChannel) {
      throw new Error('Data Channel not up')
    }
    this.dataChannel.send(message)
  }
}
