// XXX even though ethers is not used in the code below, it's very likely
// it will be used by any DApp, so we are already including it here
const { ethers } = require("ethers");

const rollup_server = process.env.ROLLUP_HTTP_SERVER_URL;
console.log("HTTP rollup_server url is " + rollup_server);

// Generate a random target number between 1 and 100
let targetNumber = Math.floor(Math.random() * 100);
// Define the max number of guesses allowed before resetting
const MAX_GUESSES = 3;
let guessCount = 0; // Tracks the number of attempts

function checkGuess(playerGuess, targetNumber, guessCount) {
  // Determine if the player's guess is correct, too low, or too high
  if (playerGuess === targetNumber) {
    return [
      `🎉 You've guessed it in ${guessCount} tries! The number was ${targetNumber}. Game reset.`,
      true,
    ];
  } else if (playerGuess > targetNumber) {
    return [
      `Too high! Your guess: ${playerGuess}, Attempts: ${guessCount}. Try again!`,
      false,
    ];
  } else {
    return [
      `Too low! Your guess: ${playerGuess}, Attempts: ${guessCount}. Try again!`,
      false,
    ];
  }
}

async function handle_advance(data) {
  console.log("Received advance request data " + JSON.stringify(data));

  try {
    const playerGuess = parseInt(hexToUtf8(data.payload));
    log.info(`Player guessed: ${playerGuess}`);

    // Increase the guess count
    guessCount++;

    // Check if the guess is correct
    const [resultMessage, isCorrect] = checkGuess(
      playerGuess,
      targetNumber,
      guessCount
    );

    if (isCorrect || guessCount >= MAX_GUESSES) {
      if (!isCorrect) {
        log.info(
          `Out of guesses! The correct number was ${targetNumber}. Game reset.`
        );
      }
      // Reset the game: generate a new target number and reset the guess counter
      targetNumber = Math.floor(Math.random() * 100);
      guessCount = 0;
    }

    // Send the result as a notice to the rollup server
    log.info(`Sending notice: '${resultMessage}'`);
    const response = await axios.post(`${rollupUrl}/notice`, {
      payload: utf8ToHex(resultMessage),
    });
    log.info(`Notice status: ${response.status}, body: ${response.data}`);
  } catch (error) {
    requestStatus = "reject";
    const errorMessage = `Error processing request ${data}\n${error.stack}`;
    log.error(errorMessage);
    const response = await axios.post(`${rollupUrl}/report`, {
      payload: utf8ToHex(errorMessage),
    });
    log.info(`Report status: ${response.status}, body: ${response.data}`);
  }

  return "accept";
}

async function handle_inspect(data) {
  console.log("Received inspect request data " + JSON.stringify(data));
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
