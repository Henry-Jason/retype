// Code mode: scripts to type, a small Python highlighter, and turning a script into typing targets.

// Hand-written scripts. Each output was produced by running the script with Python 3
// (tests/snippets.test.js checks the scripts still match these outputs when python3 is available).
export const SNIPPETS = [
  {
    id: "fizzbuzz", title: "FizzBuzz",
    code: `for n in range(1, 16):
    if n % 15 == 0:
        print("FizzBuzz")
    elif n % 3 == 0:
        print("Fizz")
    elif n % 5 == 0:
        print("Buzz")
    else:
        print(n)`,
    explain: "Counts from 1 to 15. Multiples of 3 print Fizz, multiples of 5 print Buzz, and multiples of both print FizzBuzz. The check for 15 has to come first: otherwise 15 would match the 3 test and stop there.",
    output: "1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz"
  },
  {
    id: "word-counter", title: "Word counter",
    code: `text = "the cat sat on the mat with the hat"
counts = {}
for word in text.split():
    counts[word] = counts.get(word, 0) + 1

top = max(counts, key=counts.get)
print(top, counts[top])`,
    explain: "Splits a sentence into words and tallies each one in a dictionary. counts.get(word, 0) returns 0 for a word it hasn't seen yet, so there's no special case. max with key=counts.get then picks the word with the highest tally.",
    output: "the 3"
  },
  {
    id: "fibonacci", title: "Fibonacci generator",
    code: `def fib(limit):
    a, b = 0, 1
    while a < limit:
        yield a
        a, b = b, a + b

print(list(fib(100)))`,
    explain: "A generator that produces Fibonacci numbers below a limit. yield hands back one number at a time instead of building a list, and a, b = b, a + b moves both values forward in one step. list() collects them all at the end.",
    output: "[0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89]"
  },
  {
    id: "temperatures", title: "Temperature table",
    code: `def c_to_f(c):
    return c * 9 / 5 + 32

for c in [-10, 0, 25, 100]:
    print(f"{c:>4} C = {c_to_f(c):6.1f} F")`,
    explain: "Converts Celsius to Fahrenheit and prints a lined-up table. In the f-string, :>4 right-aligns the Celsius value in four characters and :6.1f prints the result six characters wide with one decimal place, which is why the columns line up.",
    output: " -10 C =   14.0 F\n   0 C =   32.0 F\n  25 C =   77.0 F\n 100 C =  212.0 F"
  },
  {
    id: "palindrome", title: "Palindrome check",
    code: `def is_palindrome(s):
    clean = [ch.lower() for ch in s if ch.isalnum()]
    return clean == clean[::-1]

for phrase in ["racecar", "Never odd or even", "typing"]:
    print(phrase, "->", is_palindrome(phrase))`,
    explain: "Checks whether a phrase reads the same backwards. The list comprehension keeps only letters and digits, in lower case, so spaces and capitals don't matter. clean[::-1] is the same list reversed.",
    output: "racecar -> True\nNever odd or even -> True\ntyping -> False"
  },
  {
    id: "accuracy", title: "Accuracy score",
    code: `typed = "teh quick brown fox"
target = "the quick brown fox"
hits = sum(a == b for a, b in zip(typed, target))
accuracy = hits / len(target) * 100
print(f"accuracy: {accuracy:.1f}%")`,
    explain: "A tiny version of what this app does. zip pairs up the typed and target characters, each a == b is True or False, and sum counts the Trues. The swapped e and h cost two characters out of 19.",
    output: "accuracy: 89.5%"
  }
];

const KW = new Set("def return for in if elif else while yield import from as class with try except finally lambda not and or is None True False pass break continue global".split(" "));

/** One token class per character: tk-kw, tk-str, tk-num, tk-fn, tk-com or "". */
export function tokenize(s) {
  const out = new Array(s.length).fill("");
  const re = /(#.*$)|(f?"(?:[^"\\]|\\.)*"|f?'(?:[^'\\]|\\.)*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)/g;
  let m;
  while ((m = re.exec(s))) {
    const cls = m[1] ? "com" : m[2] ? "str" : m[3] ? "num" : KW.has(m[4]) ? "kw" : s[re.lastIndex] === "(" ? "fn" : "";
    if (cls) for (let i = m.index; i < re.lastIndex; i++) out[i] = "tk-" + cls;
  }
  return out;
}

/**
 * Turn a script into lines to type.
 * auto indentation: the leading spaces are shown but not typed.
 * Blank lines are shown but skipped.
 */
export function scriptLines(code, indent = "auto") {
  return code.split("\n").map((ln, i) => {
    const ind = ln.length - ln.trimStart().length;
    if (!ln.trim()) return { n: i + 1, blank: true };
    const text = ln.slice(ind), tk = tokenize(text);
    return indent === "auto"
      ? { n: i + 1, indent: ind, target: text, tokens: tk }
      : { n: i + 1, indent: 0, target: ln, tokens: new Array(ind).fill("").concat(tk) };
  });
}
