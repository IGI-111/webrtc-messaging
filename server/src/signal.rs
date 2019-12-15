use uuid::Uuid;
use std::collections::HashMap;
use std::sync::Mutex;
use ws::listen;
use ws::Message;
use ws::Sender;

lazy_static! {
    static ref CLIENTS: Mutex<HashMap<String, Sender>> = Mutex::new(HashMap::new());
}

pub fn signalling_server() {
    // TODO: encrypt comms with wss
    let server = listen("0.0.0.0:3012", |out| {
        let id = Uuid::new_v4().to_simple().to_string();

        out.send(id.clone()).unwrap();
        println!("Saw {}", id.clone());
        CLIENTS.lock().unwrap().insert(id.clone(), out);

        move |msg: Message| {
            println!("{}", msg);
            let mut toks = msg.as_text()?.splitn(4, ' ');
            let verb = toks.next().unwrap();
            let source_id = toks.next().unwrap();
            if source_id != id {
                return Ok(())
            }
            let target_id = toks.next().unwrap();
            match verb {
                "OFFER" | "ANSWER" | "ICE" => {
                    if let Some(ref client) = CLIENTS.lock().unwrap().get(target_id) {
                        client.send(msg)?;
                    }
                }
                _ => {}
            }
            Ok(())
        }
    });

    if let Err(error) = server {
        println!("Failed to create WebSocket due to {:?}", error);
    }
}
