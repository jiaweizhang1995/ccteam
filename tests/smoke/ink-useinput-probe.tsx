import React from 'react';
import { render, Box, Text, useInput } from 'ink';

function App() {
  const [count, setCount] = React.useState(0);
  useInput((input, key) => {
    process.stderr.write(`[probe] input=${JSON.stringify(input)} return=${key.return} escape=${key.escape}\n`);
    setCount((c) => c + 1);
  });
  return React.createElement(Box, null, React.createElement(Text, null, `keys: ${count}`));
}

render(React.createElement(App));
