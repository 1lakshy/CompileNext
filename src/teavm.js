// src/teavm.js
const { load } = await import("./c.js");

let compiler;
let isInitialized = false;

export async function initializeTeaVM(setStatus, setOutput) {
  setStatus("Loading TeaVM...");
  setOutput("Initializing TeaVM...\n");

  try {
    const teavm = await load("/compiler.wasm");
    compiler = teavm.exports;
    setOutput((prev) => prev + "Compiler loaded\n");

    let response = await fetch("/compile-classlib-teavm.bin");
    let arrayBuffer = await response.arrayBuffer();
    compiler.setSdk(new Uint8Array(arrayBuffer));

    response = await fetch("/runtime-classlib-teavm.bin");
    arrayBuffer = await response.arrayBuffer();
    compiler.setTeaVMClasslib(new Uint8Array(arrayBuffer));

    setStatus("Ready to compile!");
    isInitialized = true;
  } catch (err) {
    setStatus("Error initializing TeaVM");
    setOutput((prev) => prev + "Error: " + err.message + "\n");
  }
}

export async function compileJava(javaCode, setJsOutput, setOutput, setStatus) {
  if (!isInitialized) {
    alert("TeaVM not ready yet!");
    return;
  }

  try {
    setStatus("Compiling...");
    setOutput("Compiling Java code...\n");

    compiler.clearSourceFiles();
    compiler.addSourceFile("Main.java", javaCode);
    const compileResult = compiler.compile();

    if (!compileResult) {
      setStatus("Compilation failed");
      setJsOutput("// Compilation failed");
      return;
    }

    setStatus("Compilation successful!");
    setOutput((prev) => prev + "Compilation successful!\n");
  } catch (error) {
    setStatus("Compilation error");
    setJsOutput("// Error: " + error.message);
    setOutput((prev) => prev + "Error: " + error.message + "\n");
  }
}
