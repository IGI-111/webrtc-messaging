#[macro_use]
extern crate lazy_static;

use rand::distributions::Alphanumeric;
use rand::Rng;
use std::collections::HashMap;
use std::sync::Mutex;
use ws::listen;
use ws::Message;
use ws::Sender;

lazy_static! {
    static ref CLIENTS: Mutex<HashMap<String, Sender>> = Mutex::new(HashMap::new());
}

fn main() {
    let server = listen("127.0.0.1:3012", |out| {
        let id = rand_id();
        out.send(id.clone()).unwrap();
        println!("Saw {}", id.clone());
        CLIENTS.lock().unwrap().insert(id.clone(), out);

        move |msg: Message| {
            println!("{}", msg);
            let mut toks = msg.as_text()?.splitn(4, ' ');
            let verb = toks.next().unwrap();
            let source_id = toks.next().unwrap();
            let target_id = toks.next().unwrap();
            match verb {
                "OFFER" | "ANSWER" | "ICE" => {
                    // TODO: check that right channel is used
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

fn rand_id() -> String {
    let mut rng = rand::thread_rng();
    std::iter::repeat(())
        .map(|()| rng.sample(Alphanumeric))
        .take(16)
        .collect()
}
