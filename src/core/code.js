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
  },
  {
    "id": "reverse-words",
    "title": "Reverse a sentence",
    "code": "sentence = \"practice makes progress not perfect\"\nwords = sentence.split()\nprint(\" \".join(reversed(words)))\nprint(sentence[::-1])",
    "explain": "Two ways to turn text around. split() breaks the sentence into words and reversed() walks them backwards, so the word order flips but each word reads normally. sentence[::-1] is a slice with a step of -1, which reverses every character.",
    "output": "perfect not progress makes practice\ntcefrep ton ssergorp sekam ecitcarp"
  },
  {
    "id": "list-comprehensions",
    "title": "Comprehensions",
    "code": "nums = range(1, 11)\nevens = [n for n in nums if n % 2 == 0]\nsquares = {n: n * n for n in evens}\nprint(evens)\nprint(squares)\nprint(sum(squares.values()))",
    "explain": "A list comprehension keeps only the even numbers from 1 to 10, and a dictionary comprehension maps each one to its square. squares.values() gives just the squares, and sum adds them: 4 + 16 + 36 + 64 + 100.",
    "output": "[2, 4, 6, 8, 10]\n{2: 4, 4: 16, 6: 36, 8: 64, 10: 100}\n220"
  },
  {
    "id": "factorial",
    "title": "Recursive factorial",
    "code": "def factorial(n):\n    if n <= 1:\n        return 1\n    return n * factorial(n - 1)\n\nfor n in [0, 5, 10]:\n    print(n, factorial(n))",
    "explain": "A function that calls itself. Each call multiplies n by the factorial of the number below it, until it reaches the base case of 1. Without that base case it would recurse forever. 0! is defined as 1, which the n <= 1 check also covers.",
    "output": "0 1\n5 120\n10 3628800"
  },
  {
    "id": "shopping-list",
    "title": "Shopping receipt",
    "code": "items = [\"tea\", \"milk\", \"bread\"]\nprices = [3.20, 1.15, 2.40]\ntotal = 0\nfor i, (item, price) in enumerate(zip(items, prices), start=1):\n    total += price\n    print(f\"{i}. {item:<6} {price:5.2f}\")\nprint(f\"total     {total:5.2f}\")",
    "explain": "zip pairs each item with its price and enumerate numbers the pairs from 1. In the f-string, :<6 left-aligns the item name in a six-character space and :5.2f prints the price five wide with two decimals, so the columns line up like a receipt.",
    "output": "1. tea     3.20\n2. milk    1.15\n3. bread   2.40\ntotal      6.75"
  },
  {
    "id": "leaderboard",
    "title": "Sorted leaderboard",
    "code": "scores = {\"ana\": 92, \"ben\": 78, \"cara\": 85, \"dev\": 92}\nranked = sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))\nfor place, (name, score) in enumerate(ranked, start=1):\n    print(place, name, score)",
    "explain": "sorted takes a key function that decides the order. This one returns (-score, name): negating the score puts the highest first, and the name breaks ties alphabetically, which is why ana comes before dev on 92.",
    "output": "1 ana 92\n2 dev 92\n3 cara 85\n4 ben 78"
  },
  {
    "id": "safe-total",
    "title": "Skipping bad input",
    "code": "values = [\"10\", \"4.5\", \"seven\", \"-3\"]\ntotal = 0\nfor v in values:\n    try:\n        total += float(v)\n    except ValueError:\n        print(\"skipped\", v)\nprint(\"total\", total)",
    "explain": "float() turns text into a number, and raises a ValueError when it can't. try/except catches that error for the one bad value, so the loop carries on instead of crashing, and the total only includes 10, 4.5 and -3.",
    "output": "skipped seven\ntotal 11.5"
  },
  {
    "id": "binary-search",
    "title": "Binary search",
    "code": "def search(items, target):\n    lo, hi = 0, len(items) - 1\n    while lo <= hi:\n        mid = (lo + hi) // 2\n        if items[mid] == target:\n            return mid\n        if items[mid] < target:\n            lo = mid + 1\n        else:\n            hi = mid - 1\n    return -1\n\ndata = [2, 5, 8, 12, 16, 23, 38, 56]\nprint(search(data, 23), search(data, 7))",
    "explain": "Finds a value in a sorted list by checking the middle and throwing away the half it can't be in. Each step halves the search, so even a million items take about 20 checks. 23 is at index 5; 7 isn't there, so the function returns -1.",
    "output": "5 -1"
  },
  {
    "id": "counter",
    "title": "Counting letters",
    "code": "from collections import Counter\n\ntext = \"mississippi\"\ncounts = Counter(text)\nprint(counts.most_common(2))\nprint(sorted(counts))",
    "explain": "Counter tallies every character in one go. most_common(2) returns the two most frequent as (letter, count) pairs: i and s both appear four times. sorted(counts) sorts the distinct letters, since iterating a Counter gives its keys.",
    "output": "[('i', 4), ('s', 4)]\n['i', 'm', 'p', 's']"
  },
  {
    "id": "sets",
    "title": "Shared skills",
    "code": "mine = {\"python\", \"git\", \"sql\", \"excel\"}\nyours = {\"python\", \"java\", \"sql\"}\nprint(sorted(mine & yours))\nprint(sorted(mine - yours))\nprint(len(mine | yours))",
    "explain": "Sets hold unique items and support set maths. & is what both have in common, - is what only the first has, and | is everything from either, with duplicates counted once: five different skills. sorted() is there because sets have no fixed order.",
    "output": "['python', 'sql']\n['excel', 'git']\n5"
  },
  {
    "id": "caesar",
    "title": "Caesar cipher",
    "code": "def shift(text, k):\n    out = \"\"\n    for ch in text:\n        if ch.isalpha():\n            base = ord(\"a\")\n            out += chr((ord(ch) - base + k) % 26 + base)\n        else:\n            out += ch\n    return out\n\nsecret = shift(\"meet at noon\", 3)\nprint(secret, \"->\", shift(secret, -3))",
    "explain": "Moves every letter k places along the alphabet. ord turns a letter into a number and chr turns it back; % 26 wraps z round to a. Shifting by -3 undoes a shift of 3, so the message comes back. Spaces pass through untouched.",
    "output": "phhw dw qrrq -> meet at noon"
  },
  {
    "id": "collatz",
    "title": "Collatz steps",
    "code": "def collatz(n):\n    steps = 0\n    while n != 1:\n        n = n // 2 if n % 2 == 0 else 3 * n + 1\n        steps += 1\n    return steps\n\nfor start in [6, 7, 27]:\n    print(start, collatz(start))",
    "explain": "Halve even numbers, triple odd ones and add one, and count the steps to reach 1. It's an unsolved problem whether every start gets there. 27 is famous for taking 111 steps, climbing as high as 9,232 on the way.",
    "output": "6 8\n7 16\n27 111"
  },
  {
    "id": "decorator",
    "title": "Counting calls",
    "code": "def count_calls(func):\n    def wrapper(*args):\n        wrapper.calls += 1\n        return func(*args)\n    wrapper.calls = 0\n    return wrapper\n\n@count_calls\ndef greet(name):\n    return f\"hi {name}\"\n\nprint(greet(\"ana\"), greet(\"ben\"))\nprint(greet.calls)",
    "explain": "A decorator wraps a function in another one. @count_calls replaces greet with wrapper, which bumps a counter and then calls the original. Functions are objects in Python, so the counter can live as an attribute on wrapper itself.",
    "output": "hi ana hi ben\n2"
  },
  {
    "id": "transpose",
    "title": "Flipping a grid",
    "code": "grid = [[1, 2, 3],\n        [4, 5, 6]]\nflipped = [list(row) for row in zip(*grid)]\nprint(flipped)",
    "explain": "zip(*grid) unpacks the rows into zip, which then pairs up the first items of each row, then the second, and so on. That turns rows into columns, the transpose. Each column comes back as a tuple, so list() converts it.",
    "output": "[[1, 4], [2, 5], [3, 6]]"
  },
  {
    "id": "names",
    "title": "Tidying a name",
    "code": "name = \"  ada lovelace  \"\nclean = name.strip().title()\ninitials = \"\".join(part[0] for part in clean.split())\nprint(clean, initials)\nprint(clean.lower().replace(\" \", \"_\"))",
    "explain": "String methods chain left to right. strip() trims the spaces at both ends and title() capitalises each word. The initials come from the first letter of each word, joined with no separator. The last line makes a snake_case version.",
    "output": "Ada Lovelace AL\nada_lovelace"
  },
  {
    "id": "prime-sieve",
    "title": "Prime sieve",
    "code": "def primes(limit):\n    is_prime = [True] * (limit + 1)\n    is_prime[0] = is_prime[1] = False\n    for n in range(2, int(limit ** 0.5) + 1):\n        if is_prime[n]:\n            for m in range(n * n, limit + 1, n):\n                is_prime[m] = False\n    return [n for n, p in enumerate(is_prime) if p]\n\nprint(primes(50))",
    "explain": "The sieve of Eratosthenes. Start by assuming every number is prime, then for each prime cross out its multiples. It only needs to go up to the square root of the limit, and can start crossing out at n * n because smaller multiples were already crossed out.",
    "output": "[2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47]"
  },
  {
    "id": "word-lengths",
    "title": "Grouping by length",
    "code": "words = [\"red\", \"blue\", \"green\", \"tan\", \"pink\", \"gold\"]\ngroups = {}\nfor w in words:\n    groups.setdefault(len(w), []).append(w)\n\nfor length in sorted(groups):\n    print(length, groups[length])",
    "explain": "setdefault returns the list for a key, creating an empty one first if the key is new, so words can be appended without checking. The result groups words by how many letters they have; sorting the keys prints the groups from shortest to longest.",
    "output": "3 ['red', 'tan']\n4 ['blue', 'pink', 'gold']\n5 ['green']"
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
