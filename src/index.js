// XXX even though ethers is not used in the code below, it's very likely
// it will be used by any DApp, so we are already including it here
const { ethers } = require("ethers");

const rollup_server = process.env.ROLLUP_HTTP_SERVER_URL;
console.log("HTTP rollup_server url is " + rollup_server);

const MAX_CHANCE = 3;
let mysteryNumber = Math.floor(Math.random() * 20) + 1;
let guesses = 0;

function playGame(playerGuess) {
  guesses += 1;

  if (playerGuess === mysteryNumber) {
    return [
      `🎉 Bravo! You guessed right in ${guesses} ${
        guesses === 1 ? "try" : "tries"
      }! The mystery number was ${mysteryNumber}. 🏆 
      Ready for another round?`,
      true,
      "wins",
    ];
  }

  let feedback;
  if (playerGuess > mysteryNumber) {
    feedback = `😅 Oops! ${playerGuess} is way too high!`;
  } else {
    feedback = `🙃 Whoa! ${playerGuess} is too low!`;
  }

  if (guesses >= MAX_CHANCE) {
    return [
      `${feedback} Oops! You've used up all ${MAX_CHANCE} attempts. 
      The mystery number was ${mysteryNumber}. 😭 
      Let's start over!`,
      true,
      "fails",
    ];
  } else {
    return [
      `${feedback} That's attempt ${guesses} of ${MAX_CHANCE}.
      Keep going, you're almost there! 🔥`,
      false,
      "again",
    ];
  }
}

let winners = [];

async function handle_advance(data) {
  console.log("Received advance request data: " + JSON.stringify(data));

  const metadata = data["metadata"];
  const sender = metadata["msg_sender"];
  const payload = data["payload"];

  try {
    const playerGuess = parseInt(hexToUtf8(payload));
    log.info(`🔍 The player is guessing: ${playerGuess}`);

    const [resultMessage, isCorrect, status] = playGame(playerGuess);

    if (status === "wins") {
      winners.push(sender);
    }

    if (isCorrect || guesses >= MAX_CHANCE) {
      if (!isCorrect) {
        log.info(
          `😢 Out of guesses! The elusive number was ${mysteryNumber}. Better luck next time!`
        );
      }

      mysteryNumber = Math.floor(Math.random() * 20) + 1;
      guesses = 0;
      log.info(`🔄 Game reset! A new secret number has been chosen.`);
    }

    log.info(`📢 Sending notice: '${resultMessage}'`);
    const response = await axios.post(`${rollupUrl}/notice`, {
      payload: utf8ToHex(resultMessage),
    });
    log.info(`✅ Notice status: ${response.status}, body: ${response.data}`);
  } catch (error) {

    requestStatus = "reject";
    const errorMessage = `🚨 Error processing request ${data}\n${error.stack}`;

    log.error(errorMessage);

    const response = await axios.post(`${rollupUrl}/report`, {
      payload: utf8ToHex(errorMessage),
    });

    log.info(`❌ Report status: ${response.status}, body: ${response.data}`);
  }

  return "accept";
}

async function handle_inspect(data) {
  console.log("Received inspect request data " + JSON.stringify(data));

  const report_req = await fetch(rollup_server + "/report", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      payload: ethers.hexlify(ethers.toUtf8Bytes(JSON.stringify({ winners }))),
    }),
  });
  return "accept";
}

var handlers = {
  advance_state: handle_advance,
  inspect_state: handle_inspect,
};

var finish = { status: "accept" };

(async () => {
  while (true) {
    const finish_req = await fetch(rollup_server + "/finish", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "accept" }),
    });

    console.log("Received finish status " + finish_req.status);

    if (finish_req.status == 202) {
      console.log("No pending rollup request, trying again");
    } else {
      const rollup_req = await finish_req.json();
      var handler = handlers[rollup_req["request_type"]];
      finish["status"] = await handler(rollup_req["data"]);
    }
  }
})();
