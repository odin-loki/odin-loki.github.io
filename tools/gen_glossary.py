# -*- coding: utf-8 -*-
"""
Build assets/data/glossary.json — the plain-English layer.

    python3 tools/gen_glossary.py

Every technical word on this site gets an explanation a person with no
background can read once and understand. Not a shorter definition: a
different kind of sentence. "A key that opens one door and nothing else"
is what a capability is. "An unforgeable token conferring authority over a
single resource" is the same fact written to impress, and it teaches
nobody anything.

The explanations are written by hand. A model that invented definitions
would be the one thing on this site you could not check. What this script
adds is the part a human is bad at: catching yourself being clever. It
refuses to build if an explanation runs long, uses a long word that is not
on the allow-list, or leans on another piece of jargon to do the work.
Those checks are why the file is generated rather than hand-edited.

Each entry carries the domain and shape tags Cypha uses as its feature
vector — see assets/js/glossary.js.
"""
import json, re, sys, os

# The six buckets glossary.js encodes as a one-hot feature. Do not add to
# this list without widening DIM and DOMAINS in assets/js/glossary.js and
# bumping the storage key, or every saved model on every visitor's machine
# silently becomes the wrong shape.
DOMAINS = ('systems', 'security', 'ai', 'maths', 'data', 'legal')

MAX_WORDS     = 36     # whole explanation
MAX_SENTENCE  = 24     # any one sentence
MAX_WORD_LEN  = 11     # any word, unless allowed below

# Long words that earn their place: they are the thing being named, or there
# is no shorter word a reader would recognise.
ALLOW = set('''
computer computers program programs programmer programmers something everything anything
different difference differently understand understands understood themselves yourself
information technology instructions instruction electricity mathematics mathematical
operating security software hardware internet password passwords remember remembered
translate translated translation translating measurement measurements automatically
government university encryption encrypted decrypted probability statistics statistical
experiment experiments guarantees temperature permission permissions comparison
repeatedly completely expensive dangerous impossible important
Australian Australia Kickstarter ParanoidBSD HardenedBSD FreeBSD WebAssembly
JavaScript decompiler decompilers compiler compilers transformer transformers
handwriting fingerprint fingerprints neighbourhood neighbourhoods
'''.split())

# Words that are themselves jargon. An explanation that needs one of these is
# not an explanation yet. (Terms in the table may of course be these words —
# this check is only on the explaining half.)
BANNED = set('''
abstraction paradigm heuristic stochastic asymptotic orthogonal polynomial instantiate
parameterised parameterized canonical idempotent monotonic isomorphic topology manifold
variance covariance gradient tensor vector matrix scalar entropy likelihood posterior
prior bayesian inference latent embedding kernel convolution regression classifier
protocol adversary cryptographic primitive deterministic nondeterministic concurrency
mutex semaphore syscall runtime compile-time serialisation serialization deserialise
provenance idempotence lattice functor monad closure recursion polymorphism
'''.split())

TERMS = [
# ---------- the computer itself ----------
{"t":"kernel","d":"systems","g":"The boss program inside a computer. Everything else has to ask it before it can touch the screen, the disk or the network."},
{"t":"operating system","d":"systems","alias":["OS"],"g":"The software a computer runs before any of your programs. Windows, macOS and Linux are operating systems. It hands out the machine to everything else."},
{"t":"syscall","d":"systems","alias":["system call"],"g":"How a normal program asks the boss program for something it cannot do itself, like open a file or send a message."},
{"t":"userland","d":"systems","alias":["user space"],"g":"Everything on a computer that is not the boss program. Your browser, your editor, your games. It has to ask for everything."},
{"t":"running program","d":"systems","alias":["a process"],"g":"One program while it is actually running. Your computer keeps them apart so a crash in one does not take the others down."},
{"t":"thread","d":"systems","g":"One line of work inside a program. A program with several threads can do several things at once."},
{"t":"memory","d":"systems","alias":["RAM"],"g":"The computer's short-term workspace. Fast, and wiped when the power goes off. Programs keep what they are working on here."},
{"t":"file system","d":"systems","g":"The filing cabinet. It is what turns a disk full of ones and zeros into folders and files with names."},
{"t":"bootable","d":"systems","alias":["boot up","booting"],"g":"Starting a computer up from cold. A bootable disk is one a machine can actually start from."},
{"t":"firmware","d":"systems","g":"Software baked into a device, running before anything else. It is the first thing that wakes up when you press the button."},
{"t":"freestanding","d":"systems","g":"Code that runs with nothing underneath it, so none of the usual help is there. The boss program has to be written this way."},
{"t":"ABI","d":"systems","g":"The handshake rules two lumps of finished code follow so they can call each other. Break the rules and they stop fitting together."},
{"t":"API","d":"systems","g":"The list of things one program will let another ask it to do. A menu, basically."},
{"t":"GUI","d":"systems","alias":["graphical user interface"],"g":"The part you click on. Windows, buttons, menus. The opposite of typing commands."},
{"t":"command line","d":"systems","alias":["terminal","shell"],"g":"Driving a computer by typing instructions instead of clicking. Uglier, much faster once you know it."},
{"t":"HardenedBSD","d":"systems","g":"A version of the FreeBSD operating system with extra defences built in. ParanoidBSD starts from it instead of starting from nothing."},
{"t":"FreeBSD","d":"systems","g":"A free operating system anyone can read and change. A cousin of the one inside a Mac. Common in network gear and servers."},
{"t":"BSD","d":"systems","g":"A family of free operating systems that share the same ancestor. FreeBSD and HardenedBSD are both in it."},
{"t":"Linux","d":"systems","g":"The free operating system that runs most of the internet. Same job as Windows, given away and open to read."},
{"t":"KDE Plasma","d":"systems","alias":["Plasma 6","KDE Plasma 6"],"g":"A desktop you can look at and click on, for Linux and BSD. Windows, taskbar, settings, the lot."},
{"t":"Qt 6","d":"systems","alias":["Qt"],"g":"A toolkit for building windows and buttons that work the same on Windows, Mac and Linux. Used here for the desktop programs."},
{"t":"server","d":"systems","g":"A computer whose job is answering other computers. Nobody sits in front of it."},
{"t":"port","d":"systems","alias":["porting","ported"],"g":"Moving software so it runs somewhere it did not before. Rewriting the bits that were tied to the old place."},
{"t":"module","d":"systems","alias":["modules"],"g":"One self-contained piece of a program, with a clear edge. You can work on it without holding the whole thing in your head."},
{"t":"pipeline","d":"systems","g":"A line of steps where each one hands its result to the next, like a factory belt."},

# ---------- writing software ----------
{"t":"source code","d":"systems","alias":["source"],"g":"The text a person actually writes. It is the recipe; the program is the meal."},
{"t":"compiler","d":"systems","alias":["compile","compiled","compiles"],"g":"A translator that turns the text a person wrote into the numbers a machine can run. To compile is to run it through."},
{"t":"binary","d":"systems","g":"The finished program, as the machine holds it: numbers, not words. Unreadable to a person without help."},
{"t":"C++23","d":"systems","alias":["C++"],"g":"A programming language used where speed and control matter. The 23 is the 2023 edition of its rules."},
{"t":"C","d":"systems","g":"An old, fast, bare-bones programming language. Almost every operating system is still built on it, which is much of the problem."},
{"t":"Rust","d":"systems","g":"A newer programming language that refuses to compile most memory mistakes. Fast like C, far harder to get wrong."},
{"t":"Python","d":"systems","g":"A programming language that reads almost like English. Slower to run, much quicker to write."},
{"t":"LLVM","d":"systems","alias":["Clang"],"g":"The machinery a lot of translators are built on. Clang is the one that handles C and C++."},
{"t":"IR","d":"systems","alias":["intermediate representation"],"g":"A halfway form, between the text a person wrote and the numbers a machine runs. Comparing two of them shows whether two programs really do the same thing."},
{"t":"WebAssembly","d":"systems","alias":["WASM"],"g":"A way to run fast, compiled programs inside a web page. It is why the demos on this site work without installing anything."},
{"t":"repository","d":"systems","alias":["repo"],"g":"The folder where a project lives, with every past version of every file kept. Usually shared online."},
{"t":"commit","d":"systems","alias":["commits"],"g":"One saved change to a project, with a note about what it was and who did it. The history is a list of these."},
{"t":"fork","d":"systems","alias":["forkable"],"g":"Taking your own copy of somebody's project and going your own way with it. Forkable means nothing stops you."},
{"t":"GitHub","d":"systems","g":"The website where most open projects keep their files and their history. Free to read without an account."},
{"t":"README","d":"systems","g":"The front page of a project's folder. What it is, what it does, and what it does not do."},
{"t":"open source","d":"legal","alias":["open-source"],"g":"Software whose recipe is public, so anyone can read it, check it and build it. Not the same as free of charge."},
{"t":"test suite","d":"systems","alias":["test suites","unit test","unit tests"],"g":"A small program whose only job is checking that another program still does what it should. Run them every time you change something."},
{"t":"CTest","d":"systems","g":"The tool that runs all the checks for a project and reports which ones failed."},
{"t":"CI","d":"systems","alias":["continuous integration"],"g":"A robot that rebuilds the project and runs every check each time somebody changes a file. It catches breakage the same day."},
{"t":"build gate","d":"systems","alias":["build gates","verification gate","verification gates"],"g":"A rule that stops a change getting in until the checks pass. No argument, no exceptions."},
{"t":"benchmark","d":"data","alias":["benchmarks","MOTChallenge"],"g":"A fixed test everyone runs, so two different things can be compared on the same ground. Doing well on your own test proves nothing."},
{"t":"regression test","d":"systems","g":"A check that something which used to work still works. Named after the thing it stops: quietly going backwards."},
{"t":"differential execution","d":"systems","alias":["differential verification","differential"],"g":"Run the old version and the new version on the same input and compare. If they ever disagree, the new one is wrong."},
{"t":"golden","d":"data","alias":["goldens"],"g":"A known-correct answer saved on purpose, so later runs can be checked against it."},
{"t":"provenance","d":"data","g":"A written record of where each piece came from. It is how you can still tell, years later, who wrote what and under what rules."},
{"t":"stub","d":"systems","alias":["stubbed"],"g":"A placeholder that has the right shape but does nothing yet. It lets the rest of the work carry on around the hole."},
{"t":"refactor","d":"systems","alias":["rewrite pass","rewrite passes"],"g":"Tidying code without changing what it does. A rewrite pass is a tool that does one kind of tidying, everywhere, by itself."},
# ---------- security ----------
{"t":"memory safety","d":"security","alias":["memory-safe","memory-unsafe"],"g":"Making sure a program only touches the memory it was handed. Get it wrong and you have a hole. Roughly two in three serious holes are this one mistake."},
{"t":"use-after-free","d":"security","g":"A program keeps using a locker after handing the key back. Someone else gets that locker, and now they can read or change what the program is doing."},
{"t":"buffer overrun","d":"security","alias":["buffer overflow"],"g":"Pouring more data in than the space set aside for it, so the rest spills into whatever sat next door. A classic way to take over a program."},
{"t":"capability","d":"security","alias":["capabilities","capability-secured"],"g":"A key that opens one door and nothing else. Give a program that key and it can only do that one thing."},
{"t":"capability nucleus","d":"security","alias":["nucleus"],"g":"The small core of the system that hands out those keys, and turns away every request that does not carry one."},
{"t":"handle","d":"security","alias":["handles"],"g":"A ticket that stands for one thing a program is allowed to use. No ticket, no access."},
{"t":"ambient authority","d":"security","g":"When a program can do anything you can do, just because it is running as you. It is why one hacked app can read every file you own."},
{"t":"Capsicum","d":"security","g":"A FreeBSD feature that lets a program lock itself down, so from then on it can only use what it already holds."},
{"t":"sandbox","d":"security","alias":["sandboxed"],"g":"A box a program is run inside, so if it goes bad it cannot reach anything outside the box."},
{"t":"W^X","d":"security","g":"A rule that memory can be written to, or run as code, but never both. It stops an attacker writing new instructions and then running them."},
{"t":"ASLR","d":"security","g":"Shuffling where things sit in memory every time a program starts, so an attacker cannot know in advance where to aim."},
{"t":"mitigation","d":"security","alias":["mitigations"],"g":"A defence that does not fix the bug but makes it much harder to use. Locks on the windows, not a new wall."},
{"t":"sanitizer","d":"security","alias":["sanitiser","ASan","UBSan","sanitizers"],"g":"A watchdog built into the program while testing. It shouts the moment the program touches memory it should not, instead of quietly carrying on."},
{"t":"fuzzing","d":"security","alias":["fuzz","fuzz execs"],"g":"Throwing millions of random, malformed inputs at a program to see what makes it fall over. Crude, and it finds real bugs."},
{"t":"exploit","d":"security","g":"A piece of work that turns a bug into actual control of the machine. Knowing the bug is not the same as having one."},
{"t":"audit","d":"security","alias":["audited","unaudited","auditable"],"g":"Someone from outside going through the work line by line, looking for what the author missed. Unaudited means nobody has yet."},
{"t":"threat model","d":"security","g":"Writing down exactly who you are defending against and what they can do. Without one, secure means nothing."},
{"t":"encryption","d":"security","alias":["encrypted"],"g":"Scrambling a message so only the person with the right key can read it. Everyone else sees noise."},
{"t":"AEAD","d":"security","g":"Encryption that also proves nobody tampered with the message. You learn it was changed instead of reading something false."},
{"t":"nonce","d":"security","g":"A number used once and never again, to stop two scrambled messages coming out looking the same. Reuse one and the whole thing can unravel."},
{"t":"AES","d":"security","g":"The scrambling method almost everything uses, from your bank to your phone. Decades old and still unbroken."},
{"t":"hash","d":"security","alias":["hashed","hashing"],"g":"A fixed-length fingerprint of any piece of data. Same data, same fingerprint. Change one letter and the fingerprint changes completely."},
{"t":"XOR","d":"maths","g":"A simple either-or rule: true when one side is true, but not when both are. Half of all secret codes lean on it."},
{"t":"GF(2)","d":"maths","g":"Arithmetic with only two numbers, 0 and 1, where adding is the either-or rule. Exactly how a chip already works."},
{"t":"side channel","d":"security","g":"Learning a secret from something other than the message: how long it took, how much power it drew, how loud the fan got."},

# ---------- privacy and networks ----------
{"t":"metadata","d":"security","g":"Everything about a message except what it says: who, when, how big, how often. Usually more revealing than the message."},
{"t":"traffic analysis","d":"security","g":"Working out who is talking to whom by watching the shape of the traffic, without reading a word of it."},
{"t":"mixnet","d":"security","alias":["mix network"],"g":"A relay chain that shuffles messages and sends them on, so nobody watching can match what went in to what came out."},
{"t":"Sphinx","d":"security","g":"A message format for relay chains where each hop peels off one layer and learns nothing but the next hop."},
{"t":"constant-rate","d":"security","alias":["constant rate"],"g":"Sending at the same steady rate whether you have anything to say or not, padding with nothing. A watcher cannot tell talking from silence."},
{"t":"global passive adversary","d":"security","g":"Someone who can watch every wire everywhere but never touch anything. The hardest opponent to hide from, and the one to design against."},
{"t":"cover traffic","d":"security","alias":["cover"],"g":"Fake messages sent to keep the real ones company, so the real ones do not stand out."},
{"t":"latency","d":"systems","g":"The wait between asking and getting an answer. Privacy usually costs latency; there is no way round it."},
{"t":"bandwidth","d":"systems","g":"How much data can go down the pipe per second. Not the same as how long it takes to start arriving."},
{"t":"clearnet","d":"security","g":"The ordinary internet, outside any privacy network. Leaving into it is the weakest point of any such system."},
{"t":"correlation attack","d":"security","g":"Matching what went in against what came out by timing alone. If the pattern lines up, the link is exposed."},
{"t":"anonymity","d":"security","alias":["anonymity set"],"g":"Being lost in a crowd. The bigger the crowd behaving the same way, the better hidden you are."},

# ---------- reverse engineering ----------
{"t":"decompiler","d":"systems","alias":["decompile","decompiled"],"g":"A tool that reads a finished program and tries to work backwards to readable text. Like guessing the recipe from the cake."},
{"t":"pseudocode","d":"systems","g":"Something shaped like code that a person can follow, but that nobody could run. Most decompilers stop here."},
{"t":"reverse engineering","d":"systems","g":"Working out how something does what it does without being told. Usually because nobody kept the recipe."},
{"t":"disassembly","d":"systems","alias":["assembly","disassembler"],"g":"The lowest readable form of a program: one tiny machine instruction per line. True, and almost impossible to read in bulk."},
{"t":"ELF","d":"systems","g":"The file shape a finished program takes on Linux and BSD. Windows uses a different one."},
{"t":"PE","d":"systems","g":"The file shape a finished program takes on Windows. Every .exe is one."},
{"t":"serialization","d":"systems","alias":["serialisation","serialization formats"],"g":"Flattening something out so it can be saved or sent, and put back together at the other end."},
{"t":"concurrency","d":"systems","alias":["concurrent"],"g":"Several things happening in a program at once. It is where the hardest bugs live, because the order changes every run."},
{"t":"symbol","d":"systems","alias":["symbols","name-blind","name-assisted"],"g":"The human-readable names left inside a program. Strip them and the work gets far harder. Name-blind means working with none."},
# ---------- AI and learning ----------
{"t":"AI","d":"ai","alias":["artificial intelligence"],"g":"Software that gets better at a job by being shown examples, instead of being told the rules step by step."},
{"t":"AI model","d":"ai","alias":["language model","the model","a model","trained model"],"g":"The thing that comes out of showing a program lots of examples. A big pile of numbers that turns a question into an answer."},
{"t":"training","d":"ai","alias":["train","trained"],"g":"Showing a program examples over and over and nudging its numbers each time it gets one wrong."},
{"t":"weights","d":"ai","g":"The numbers inside a model. They are all it knows. Training is just the slow business of changing them."},
{"t":"parameters","d":"ai","alias":["params"],"g":"Another word for those numbers. More of them means more room to learn, and more to get wrong."},
{"t":"neural network","d":"ai","alias":["neural"],"g":"Layers of simple sums stacked up, each feeding the next. Nothing in there thinks; the stack as a whole does something useful."},
{"t":"transformer","d":"ai","g":"The design behind almost every modern AI that handles language. Its trick is letting every word look at every other word."},
{"t":"self-attention","d":"ai","alias":["attention"],"g":"Letting every word in a sentence check every other word before deciding what it means. Powerful, and the cost grows fast as the text gets longer."},
{"t":"token","d":"ai","alias":["tokens"],"g":"A chunk of text an AI handles at one go, usually a word or part of one. Costs are counted in these."},
{"t":"classifier","d":"ai","alias":["classify","classification"],"g":"Something that sorts each input into one of a fixed set of buckets. Spam or not spam."},
{"t":"regression","d":"ai","g":"Predicting a number rather than a bucket. How much, not which one."},
{"t":"online learning","d":"ai","alias":["online learner","keeps learning"],"g":"A model that keeps learning while it is being used, from each new thing it sees, instead of being trained once and frozen."},
{"t":"distilled","d":"ai","alias":["distillation","distil"],"g":"Training a small model to copy a big one's answers. You keep most of the skill in a fraction of the size."},
{"t":"held-out","d":"data","alias":["held out","test set"],"g":"Examples kept back on purpose and never shown during training, so the score at the end means something."},
{"t":"overfitting","d":"ai","alias":["overfit"],"g":"When a model memorises the practice questions instead of learning the subject. Perfect on those, useless on anything new."},
{"t":"baseline","d":"data","g":"The simplest thing that could work, measured first. If the clever method cannot beat it, the clever method is not worth it."},
{"t":"perplexity","d":"ai","alias":["PPL"],"g":"How surprised a language model is by real text. Lower is better. Roughly: how many words it was torn between at each step."},
{"t":"BPC","d":"ai","alias":["bits per character"],"g":"How many bits a model needs to store each character of text. Lower means it understood the text better."},
{"t":"latent","d":"ai","alias":["latents","latent space"],"g":"The hidden summary a model builds of something before it does anything with it. Squeezing a picture down to what matters."},
{"t":"embedding","d":"ai","alias":["embeddings"],"g":"Turning a word or thing into a list of numbers, so that similar things end up with similar lists."},
{"t":"inference","d":"ai","g":"Actually using a trained model to get an answer. The part you pay for every time, as opposed to training, which you pay for once."},
{"t":"GPT-2","d":"ai","g":"An older, openly published language model. Small by today's standards, which makes it a fair yardstick to measure against."},
{"t":"random Fourier features","d":"ai","alias":["RFF"],"g":"A trick that bends data into a shape where a straight line can separate it. Cheap, and it makes a simple method behave like a complicated one."},
{"t":"information bottleneck","d":"ai","g":"Deliberately forcing a model through a narrow pipe, so it has to throw away everything except what actually matters."},
{"t":"MDL","d":"ai","alias":["minimum description length"],"g":"The idea that the best explanation is the one you can write down in the fewest words. Simpler beats fancier unless fancier earns it."},
{"t":"AIXI","d":"ai","g":"A maths-only description of the perfect learner, which needs infinite computing power. Useless to run, useful to aim at."},
{"t":"active inference","d":"ai","g":"The idea that a thing acts in order to be less surprised by what happens next. Curiosity, written as a sum."},
{"t":"reaction-diffusion","d":"ai","g":"Two things spreading and reacting on a surface. It makes spots and stripes on its own, the way animal markings form."},
{"t":"Hebbian","d":"ai","alias":["BCM","plasticity"],"g":"Cells that fire together wire together. A learning rule borrowed from brains, where each connection changes on its own local evidence."},
{"t":"forward pass","d":"ai","g":"One run of a model from input to answer. Normally nothing learns during it; here, something does."},
{"t":"reasoning tokens","d":"ai","alias":["reasoning"],"g":"The working-out a model does before answering. You are charged for it even though you often never see it."},
{"t":"self-certify","d":"ai","alias":["self-certifies","self-certification"],"g":"Letting the thing that did the work also be the judge of whether the work is right. It is never allowed here."},
{"t":"Cypha","d":"ai","g":"The AI built for this site, from first principles rather than from a copy of somebody else's design. It sorts, predicts and keeps learning as it goes."},

# ---------- maths and data ----------
{"t":"algorithm","d":"maths","alias":["algorithms"],"g":"A fixed recipe for getting something done: these steps, in this order, every time."},
{"t":"Poisson","d":"maths","g":"The maths of things that happen at random but at a steady average rate. How many buses arrive in an hour."},
{"t":"Hawkes process","d":"maths","alias":["Hawkes"],"g":"Maths for events that make more events likely straight after. One burglary on a street makes the next one more likely, for a while."},
{"t":"DBSCAN","d":"data","g":"A way of finding clumps in scattered points, without being told how many clumps to look for. Anything not in a clump is left out as noise."},
{"t":"kernel density","d":"data","alias":["KDE hotspots","KDE hotspot"],"g":"Turning a scatter of dots into a smooth heat map, so the busy areas show up as hills."},
{"t":"Rossmo","d":"data","alias":["geographic profiling"],"g":"Working backwards from where crimes happened to where the person probably lives. Offenders avoid their own doorstep, and that gap is the clue."},
{"t":"BLAS","d":"maths","g":"The standard set of building blocks for number crunching. Almost all heavy maths software sits on top of them."},
{"t":"LAPACK","d":"maths","g":"The standard library for solving big systems of equations. Old, careful, and everywhere."},
{"t":"LU","d":"maths","g":"Splitting a grid of numbers into two simpler ones, so equations can be solved quickly. A workhorse, not a party trick."},
{"t":"SVD","d":"maths","g":"Breaking a grid of numbers into its main directions, strongest first. Keep the top few and you have squeezed the data with little loss."},
{"t":"eigensolver","d":"maths","alias":["eigenvalue"],"g":"Finding the directions a system leaves pointing the same way, and how much it stretches each one. It is how you find its natural shape."},
{"t":"ODE","d":"maths","g":"An equation about how something changes over time. Solving it tells you where the thing ends up."},
{"t":"PDE","d":"maths","g":"An equation about how something changes over time and space at once. Weather and heat spreading are both this."},
{"t":"FEM","d":"maths","alias":["finite element"],"g":"Chopping a shape into thousands of small pieces so a hard physical question can be answered piece by piece."},
{"t":"CFD","d":"maths","g":"Simulating how air or water flows, by computer, instead of building it and blowing air at it."},
{"t":"CAS","d":"maths","alias":["computer algebra"],"g":"Software that does algebra in symbols rather than numbers. It gives you x squared, not 4."},
{"t":"optimisation","d":"maths","alias":["optimization"],"g":"Searching for the best setting of some dials, when trying every combination would take longer than you have."},
{"t":"information geometry","d":"maths","g":"Treating a set of possible beliefs as a curved surface, so you can measure how far apart two beliefs really are."},
{"t":"natural gradient","d":"ai","g":"Taking a step towards a better answer in a direction that accounts for the shape of the problem, rather than blindly downhill."},
{"t":"F1","d":"data","alias":["F1 score"],"g":"One number balancing two worries: how often you were right, and how much you missed. 1.0 is perfect, 0 is hopeless."},
{"t":"Gaussian","d":"maths","alias":["normal distribution"],"g":"The bell curve. Most things near the middle, fewer out at the edges."},
{"t":"prime","d":"maths","alias":["primes"],"g":"A whole number that only divides by itself and one. 2, 3, 5, 7, 11. They are the building blocks of every other number."},
{"t":"random projection","d":"maths","g":"Squashing something with many numbers down to fewer, at random. Surprisingly, how far apart things are mostly survives the squash."},
{"t":"TF-IDF","d":"data","g":"Scoring a word by how often it appears here and how rare it is everywhere else. It is how a search finds what a page is really about."},
{"t":"cosine similarity","d":"data","alias":["cosine"],"g":"Measuring how alike two lists of numbers are by the angle between them, not their size. Pointing the same way means saying the same thing."},
# ---------- licensing, money, this project ----------
{"t":"AGPL","d":"legal","alias":["AGPL-3.0","AGPL-3.0+","GNU Affero General Public License"],"g":"A licence that lets anyone use and change the software. One condition: hand your version to others and you hand over your changes too."},
{"t":"source-available","d":"legal","g":"You can read all the code. Whether you can use it for anything you like is a separate question, answered by the licence."},
{"t":"licence","d":"legal","alias":["license","licensing"],"g":"The written permission that says what you are allowed to do with something somebody else made."},
{"t":"dual licence","d":"legal","alias":["dual licensing","tiered commercial licence","commercial licence"],"g":"The same software offered two ways: free with strings attached, or paid with the strings cut. You pick."},
{"t":"copyleft","d":"legal","g":"A licence that passes its own rules on. Use this freely, but whatever you build from it has to be as free as it was."},
{"t":"attribution","d":"legal","g":"Saying who made it. Most free licences ask for nothing else."},
{"t":"relicense","d":"legal","alias":["relicensed","relicensing"],"g":"Changing the rules a piece of software is handed out under. Only the person who wrote it can, which is why inherited code keeps its old rules."},
{"t":"all-or-nothing","d":"legal","g":"A funding rule: hit the target and every pledge is taken, miss it and nobody is charged a cent."},
{"t":"pledge","d":"legal","alias":["pledges","pledging","backer","backers","backing"],"g":"Promising money to a campaign. Nothing leaves your account unless the campaign reaches its target."},
{"t":"crowdfunding","d":"legal","alias":["Kickstarter"],"g":"Asking a lot of people for a small amount each, up front, to pay for something that does not exist yet."},
{"t":"perk","d":"legal","alias":["reward","rewards"],"g":"Something a campaign gives back to the people who paid. Here there is exactly one, and everything else is a plain donation."},
{"t":"AUD","d":"legal","g":"Australian dollars. Roughly two thirds of a US dollar, though that moves."},
{"t":"compute","d":"systems","alias":["verification compute","AI credits"],"g":"Raw computer time, bought by the hour or by the job. It is the one thing this project is asking money for."},
{"t":"overhead","d":"legal","g":"Money that goes on running the thing rather than on the thing itself. Fees, postage, admin."},

# ---------- chess ----------
{"t":"chess engine","d":"ai","alias":["the engine"],"g":"A program that plays chess by looking ahead through millions of positions and scoring each one."},
{"t":"search depth","d":"ai","alias":["depth","ply"],"g":"How many moves ahead a program looks. Each extra move ahead costs many times more work than the one before."},
{"t":"alpha-beta","d":"ai","alias":["alpha-beta search"],"g":"A way of looking ahead that stops exploring a line as soon as it is clearly worse than one already found. Same answer, far less work."},
{"t":"evaluation","d":"ai","alias":["eval"],"g":"A score for a chess position, in pawns. Plus two means you are about two pawns better off."},
{"t":"Elo","d":"data","g":"A rating for how strong a player is. Beat stronger players and it climbs; a 200-point gap means the stronger one wins about three games in four."},
{"t":"opening book","d":"ai","alias":["chess opening"],"g":"The first several moves of a chess game, worked out long ago and memorised rather than calculated."},
{"t":"endgame","d":"ai","g":"The last stage of a chess game, with few pieces left. It is more about counting than about ideas."},

# ---------- the honest-engineering vocabulary this site uses ----------
{"t":"specification","d":"systems","alias":["spec"],"g":"The written statement of what something must do, agreed before it is built. Without one, done is just an opinion."},
{"t":"verification","d":"systems","alias":["verify","verified","unverified"],"g":"Proving the thing actually does what it was meant to, by checking, not by looking at it and feeling good."},
{"t":"deterministic","d":"systems","g":"Same input, same answer, every single time. No luck involved, so a failure can always be reproduced."},
{"t":"reproducible","d":"data","g":"Somebody else, on their own machine, gets the same result. It is the difference between a finding and a story."},
{"t":"compile-only","d":"systems","g":"The program builds without complaint. That is all it means. It says nothing about whether the program is correct."},
{"t":"escalation","d":"ai","alias":["escalated","escalate"],"g":"Handing the hard cases up to something bigger and more expensive, after the cheap thing has had its go."},
{"t":"residue","d":"systems","g":"Whatever is left after the automatic tools have taken everything they can. By definition, the awkward part."},
{"t":"provenance entry","d":"data","g":"A line in the record saying where this particular file came from and under whose rules. No entry, not finished."},
{"t":"speculative","d":"data","g":"Made up on purpose, as an exercise. Flagged here wherever it appears, so it is never mistaken for a finding."},
{"t":"limitation","d":"data","alias":["limitations"],"g":"Something the work cannot do, written down by the person who made it. Published here rather than buried."},
{"t":"peer review","d":"data","alias":["externally reviewed","peer-reviewed"],"g":"Other experts going over the work before anyone trusts it. Slow, awkward, and the reason published science is worth more than a blog post."},
{"t":"research operating system","d":"systems","alias":["research OS"],"g":"An operating system built to try an idea, not to be relied on. Interesting to read, not something to put your bank on."},
{"t":"production-ready","d":"systems","g":"Safe to rely on for real work, where it matters if it breaks. A very high bar, and claimed far more often than it is met."},
{"t":"beta","d":"systems","alias":["beta tester","beta testing"],"g":"An early version handed to volunteers to find what breaks, before anyone is asked to depend on it."},
{"t":"scope","d":"systems","alias":["scoped","scoping"],"g":"Agreeing exactly what is and is not included, before starting. It is what stops a small job quietly becoming a large one."},
{"t":"first principles","d":"maths","alias":["first-principles"],"g":"Building up from what you know is true, instead of copying what everyone else does and hoping they were right."},
{"t":"provable","d":"maths","alias":["proof","theorem"],"g":"Shown to be true by argument, not by testing it a lot and finding no problem. A proof covers every case at once."},
{"t":"heat map","d":"data","alias":["hotspot","hotspots"],"g":"A picture where colour means how much. Red for busy, blue for quiet."},
{"t":"provisional","d":"data","alias":["planning estimate","planning estimates"],"g":"A best guess, labelled as a guess. It is there so you can argue with it, not so you can rely on it."},
{"t":"investigative lead","d":"data","alias":["investigative leads"],"g":"A suggestion worth looking into. Not evidence, and not an accusation."},
{"t":"tracker","d":"data","alias":["trackers"],"g":"Two different things. On this site: software that follows where things are. On the web: hidden code that reports what you did to somebody else."},
{"t":"cookie","d":"data","alias":["cookies"],"g":"A small note a website leaves in your browser to recognise you later. This site leaves none."},

# ---------- keeping track of things that move ----------
{"t":"tracking","d":"data","alias":["multi-target tracking","tracker engine"],"g":"Working out, from lots of separate sightings, which ones are the same thing. A camera sees a dot; tracking says which dot is which person."},
{"t":"track","d":"data","alias":["tracks"],"g":"The software's idea of one thing it is following: where it is, how fast, and how sure it is. Not the thing itself, only the belief about it."},
{"t":"sighting","d":"data","alias":["detection","detections","observation"],"g":"One moment when a sensor noticed something. It says where, roughly, and nothing about what it was."},
{"t":"coasting","d":"data","alias":["coast"],"g":"Carrying on with a guess when nothing can see the thing any more. The guess gets worse the longer it goes on, and good software says so."},
{"t":"dormant","d":"data","alias":["dormant track"],"g":"Put aside rather than thrown away. The software stops claiming it knows where something is, but keeps what it learned in case it turns up again."},
{"t":"re-identification","d":"data","alias":["re-identify","reacquire","reacquired","re-ID"],"g":"Deciding that a thing that just turned up is one you had seen before, not a new one."},
{"t":"identity switch","d":"data","alias":["identity switches","id switch"],"g":"When software mixes two things up and gives one of them the other's name. Everything it later says about either is then wrong."},
{"t":"ghost track","d":"data","alias":["ghost tracks"],"g":"Something the software thinks is there and is not. Usually a sensor error it took seriously."},
{"t":"existence","d":"data","alias":["probability of existence"],"g":"How sure the software is that a thing is there at all, kept apart from where it thinks it is. Those are two different questions."},
{"t":"particle filter","d":"maths","alias":["particles"],"g":"Guessing where something is by keeping thousands of possible answers at once and letting evidence kill off the wrong ones."},
{"t":"association","d":"data","alias":["data association"],"g":"Deciding which new sighting belongs to which thing already being followed. Get it wrong and two things swap names."},
{"t":"pattern of life","d":"data","g":"What is normal for one particular thing: where it goes, and when. Useful because odd behaviour only means something against a habit."},
{"t":"rendezvous","d":"data","alias":["convergence"],"g":"Two things about to meet. Software can often tell before either has arrived, from where they are heading."},
{"t":"transponder","d":"data","alias":["AIS"],"g":"A box on a ship or aircraft that keeps announcing where it is. Switching it off is how something disappears on purpose."},

# ---------- TRACE's own vocabulary ----------
{"t":"TRACE","d":"data","g":"The tracking engine on this site. It works out which sightings are the same thing, and holds on to that thing while nothing can see it."},
{"t":"PMBM","d":"data","g":"The method TRACE uses to follow several things at once. Its trick is treating whether a thing is there as a separate question from where it is."},
{"t":"MOTA","d":"data","g":"One number for how well a tracker did. It counts misses, things that were never there, and mix-ups, all together."},
{"t":"MOT17","d":"data","alias":["MOT20"],"g":"Public video with every person in it marked by hand, so anyone's tracker can be tested on the same footage."},
{"t":"occlusion","d":"data","alias":["occluded"],"g":"When one thing passes behind another and cannot be seen. Brief, ordinary, and the main reason a tracker loses things."},
{"t":"descriptor","d":"data","alias":["descriptors","appearance descriptor"],"g":"A short summary of what something looks like, kept so it can be told apart from something else nearby."},
{"t":"kinematics","d":"maths","g":"How a thing moves — how fast and which way — without asking what is pushing it."},
{"t":"Bernoulli","d":"maths","g":"A name you meet on things that either happen or do not, with a number for how likely. Here: whether a track is real at all."},
{"t":"Gibbs sampling","d":"maths","alias":["Gibbs"],"g":"Finding a good whole answer by fixing one piece at a time, over and over, until the whole thing settles down."},
{"t":"Markov chain","d":"maths","alias":["Markov"],"g":"Something that changes step by step, where what happens next depends only on where it is now, not on how it got there."},
{"t":"Ornstein-Uhlenbeck","d":"maths","alias":["OU","Ornstein","Uhlenbeck"],"g":"A way of describing something that wanders about but keeps being pulled back. A boat on a mooring, not a boat adrift."},
{"t":"Gaussian mixture","d":"maths","alias":["Gaussian","GMM"],"g":"Several bell curves added together, to describe a thing that one bell curve cannot. Used here to learn where an entity usually goes."},
{"t":"possibility","d":"maths","alias":["possibilistic"],"g":"How good the evidence is, rather than how much of it there is. Many weak reports can look like certainty; this is what notices."},
{"t":"uncertainty","d":"maths","g":"How wrong a number might be. Reporting it is the difference between a measurement and a guess."},
{"t":"CUDA","d":"systems","g":"Nvidia's way of running your own code on a graphics card instead of the main processor. Good at doing the same sum thousands of times."},
{"t":"AVX","d":"systems","alias":["AVX2","AVX-512","SIMD"],"g":"Instructions that let one processor do the same sum on eight numbers at once instead of one at a time."},

# ---------- acronyms a reader meets on these pages: the machine ----------
{"t":"CPU","d":"systems","alias":["processor"],"g":"The part of a computer that does the actual work, one instruction after another. Everything else is storage or wiring."},
{"t":"GPU","d":"systems","alias":["graphics card"],"g":"A chip built to do thousands of small sums at the same time. Made for drawing pictures, now used for maths of any kind."},
{"t":"KB","d":"systems","alias":["MB","GB","TB","kilobyte","megabyte","gigabyte"],"g":"Sizes. A byte is about one letter. A thousand of them is a KB, a million an MB, a billion a GB. A thousand GB is a TB."},
{"t":"ISA","d":"systems","g":"The list of instructions a chip understands. Two chips with the same list can run the same program without it being rebuilt."},
{"t":"TLB","d":"systems","g":"A small fast note of where things were last found in memory, so the computer does not have to look them up again."},
{"t":"FPGA","d":"systems","g":"A chip you rewire rather than program. Slower than a purpose-built one, but you can change your mind."},
{"t":"HDL","d":"systems","alias":["SystemVerilog","Verilog","VHDL","RTL"],"g":"A language for describing a chip rather than a program. You write what the wiring does, and a tool works out the wiring."},
{"t":"BIOS","d":"systems","g":"The tiny program that runs first when you press the power button, before anything else exists."},
{"t":"JIT","d":"systems","g":"Translating a program into machine instructions while it is already running, rather than beforehand. Slower to start, faster after."},
{"t":"JVM","d":"systems","alias":["DEX","CIL"],"g":"A pretend computer that real computers imitate, so one program can run anywhere without being rebuilt for each machine."},
{"t":"AST","d":"systems","g":"A program drawn as a tree rather than as text, which is the shape every tool that reads code actually works on."},
{"t":"ARM","d":"systems","g":"A family of chip designs. Phones, and now laptops and servers. The other family is the one in most desktops."},
{"t":"GCC","d":"systems","alias":["MSVC","Clang"],"g":"Programs that turn source code into something a machine can run. Different ones, same job, and they disagree in the corners."},
{"t":"JSON","d":"data","alias":["XML","CSV"],"g":"Plain-text ways of writing data down so two programs can pass it between them. Readable by a person, at a pinch."},
{"t":"UI","d":"systems","alias":["interface"],"g":"The part you see and touch. Everything underneath is arranged to serve it, or ought to be."},
{"t":"TCP","d":"security","alias":["IP"],"g":"The rules computers follow to pass messages over a network, and to notice when one goes missing."},
{"t":"SHA","d":"security","alias":["SHA-256","hash"],"g":"A way of turning any file into one short number. Change a single letter and the number changes completely."},
{"t":"RSA","d":"security","g":"An old and widely used way of locking a message with one key so that only the other key opens it."},
{"t":"PDF","d":"data","g":"A file that looks the same everywhere, because it carries its own layout rather than trusting the reader's."},
{"t":"REST","d":"systems","alias":["API"],"g":"A common way for one program to ask another for something over the network, using ordinary web requests."},
{"t":"ZFS","d":"systems","alias":["OpenZFS"],"g":"A way of storing files that checks its own work, so a disk quietly corrupting a file is noticed rather than passed on."},
{"t":"GNU","d":"legal","alias":["GPL","GPL-2","CDDL"],"g":"A family of free-software licences, and the project that wrote them. Sharing is the condition of use, not a nice extra."},
{"t":"MIT","d":"legal","alias":["MIT licence"],"g":"About the most permissive licence there is: do what you like, keep the notice, expect no promises."},
{"t":"CC","d":"legal","alias":["Creative Commons","CC BY"],"g":"Ready-made licences for writing, pictures and data, in a few strengths from \u201Ccredit me\u201D upward."},
{"t":"NIST","d":"security","alias":["ANSI","standards body"],"g":"A public body that publishes the reference version of things, so everyone can mean the same thing by them."},
{"t":"RFC","d":"systems","g":"How the rules of the internet are written down and agreed. The name means Request For Comments, and that was not a joke."},
{"t":"WSL","d":"systems","g":"A way of running Linux programs inside Windows without a second machine."},
{"t":"KDE","d":"systems","alias":["Plasma"],"g":"One of the two main desktops for Linux: the windows, the panel, the settings. The other is GNOME."},
{"t":"MPI","d":"systems","alias":["OpenMP","TBB"],"g":"Ways of splitting one job across many processors or many machines, and getting the pieces back in order."},
{"t":"CFI","d":"security","alias":["RTTI","SafeStack"],"g":"A guard that checks a program only jumps where it was built to jump, so an attacker cannot redirect it mid-run."},
{"t":"FSM","d":"systems","alias":["state machine"],"g":"A design with a fixed set of states and rules for moving between them. Easy to check, because you can list every case."},
{"t":"DAC","d":"systems","alias":["ADC"],"g":"The bridge between numbers and voltages. One turns a number into a signal; the other turns a signal into a number."},

# ---------- money, law and the rest of the furniture ----------
{"t":"GDP","d":"legal","g":"Everything a country produces in a year, added up and priced. A rough number that gets treated as a precise one."},
{"t":"IMF","d":"legal","g":"A body that lends money to countries in trouble, and attaches conditions. Its figures are widely used as a reference."},
{"t":"USD","d":"legal","alias":["AUD","dollars"],"g":"Dollars. Named here because the same number means different things in different currencies, and this site says which."},
{"t":"COGS","d":"legal","g":"What it costs to make each unit, before rent, wages or anything else. The floor under a price."},
{"t":"TCO","d":"legal","g":"What a thing costs over its whole life, not just to buy: running it, fixing it, and getting rid of it."},
{"t":"SKU","d":"legal","g":"One specific item as a shop lists it. Two sizes of the same thing are two of these."},
{"t":"NDA","d":"legal","g":"An agreement not to repeat what you are about to be told. Normal in business, and a reason some work cannot be shown."},
{"t":"FDA","d":"legal","g":"The American body that decides whether a drug or device may be sold there. Approval is slow on purpose."},
{"t":"CBOE","d":"legal","g":"An American exchange, and the source of the volatility index that gets quoted as a measure of market fear."},
{"t":"GIS","d":"data","g":"Software for maps that carry data — not a picture of a place, but a place you can ask questions of."},
{"t":"HUMINT","d":"data","g":"Information that came from a person talking to another person, rather than from a sensor or a computer."},
{"t":"QR","d":"data","alias":["QR code"],"g":"The square of black and white blocks a phone camera reads. It is just a short piece of text, stored oddly."},
{"t":"UV","d":"maths","g":"Light just past the blue end of what an eye can see. It carries enough energy to break things and to set glues."},
{"t":"FIDE","d":"data","g":"The body that runs world chess and hands out the ratings. A rating is a number for how strong a player is."},
{"t":"PP","d":"maths","alias":["percentage point","percentage points"],"g":"The gap between two percentages. Going from 40% to 45% is five of these, not a five per cent rise."},

# ---------- the last of the everyday ones ----------
{"t":"STL","d":"systems","g":"The set of ready-made lists, maps and sorting that comes with C++. Using it is the default; writing your own is the exception."},
{"t":"WAT","d":"systems","g":"WebAssembly written out as readable text instead of bytes, so a person can look at what a browser is about to run."},
{"t":"ORC","d":"systems","g":"The part of LLVM that assembles machine code while a program is already running, and hands it back ready to call."},
{"t":"PTX","d":"systems","g":"The halfway language a graphics card program is shipped in. The driver turns it into real instructions for whichever card is present."},
{"t":"GGUF","d":"ai","g":"A single-file format for a trained model, holding the weights and everything needed to run them. Made for running one on your own machine."},
{"t":"COOP","d":"security","alias":["COEP"],"g":"Two headers a web server can send to wall a page off from other pages. Some browser features are only allowed behind them."},
{"t":"CFS","d":"systems","g":"How Linux decided for years which program runs next: give everyone a fair share of time, and track who is owed."},
{"t":"SP","d":"systems","alias":["stack pointer","program counter"],"g":"Two of the handful of slots a processor keeps for itself. One remembers where it is; the other remembers where it came from."},
{"t":"ES","d":"ai","alias":["evolution strategy","(1+1)-ES"],"g":"Improving something by making a small random change, keeping it if it helped, and throwing it away if it did not."},
{"t":"MVV-LVA","d":"ai","alias":["MVV","LVA"],"g":"A rule of thumb for chess engines: look first at taking a big piece with a small one. It is usually the best move and cheap to spot."},
{"t":"BA","d":"maths","alias":["Barabasi-Albert"],"g":"A way of building a pretend network where new arrivals prefer to attach to whoever is already popular. It produces a few huge hubs."},
{"t":"NIG","d":"maths","alias":["heavy-tailed"],"g":"A bell curve with fatter edges, for when rare big surprises happen more often than a plain bell curve would allow."},
{"t":"IIA","d":"maths","alias":["Radau"],"g":"A family of methods for stepping an equation forward in time that stay stable when the thing being solved changes very fast."},
{"t":"HIP","d":"systems","g":"Squeezing hot metal from every side at once until the last pores close. It turns a pressed powder into a solid part."},
]

def check(terms):
    bad = []
    seen = {}
    for t in terms:
        g, name = t['g'], t['t']
        if t['d'] not in DOMAINS:
            bad.append('%s: unknown domain %r' % (name, t['d']))
        key = name.lower()
        if key in seen:
            bad.append('%s: duplicate term' % name)
        seen[key] = True
        words = re.findall(r"[A-Za-z][A-Za-z'’-]*", g)
        if len(words) > MAX_WORDS:
            bad.append('%s: %d words, limit %d' % (name, len(words), MAX_WORDS))
        for s in re.split(r'(?<=[.!?])\s+', g):
            n = len(re.findall(r"[A-Za-z][A-Za-z'’-]*", s))
            if n > MAX_SENTENCE:
                bad.append('%s: sentence of %d words, limit %d' % (name, n, MAX_SENTENCE))
        own = set(re.findall(r"[a-z]+", name.lower()))
        for w in words:
            lw = w.lower().strip("'’-")
            if lw in own or w in ALLOW or lw in ALLOW:
                continue
            if lw in BANNED:
                bad.append('%s: leans on jargon %r' % (name, w))
                continue
            # A hyphenated compound is two short words, not one long one.
            for part in lw.split('-'):
                if part in own or part in ALLOW or len(part) <= MAX_WORD_LEN:
                    continue
                if w[0].islower():
                    bad.append('%s: long word %r (%d letters)' % (name, part, len(part)))
    return bad

def main(terms):
    bad = check(terms)
    if bad:
        for b in bad:
            print('  ! ' + b)
        sys.exit('%d problem(s) — glossary not written' % len(bad))
    out = {
        '_note': ('Plain-English explanations for the jargon on this site. Written by hand, '
                  'not generated: a model that invented definitions would be the one thing '
                  'here you could not check. Built and checked by tools/gen_glossary.py, '
                  'which refuses any explanation that runs long or leans on more jargon. '
                  'Each entry carries the domain and shape tags Cypha uses as its feature '
                  'vector — see assets/js/glossary.js.'),
        'terms': terms,
    }
    os.makedirs('assets/data', exist_ok=True)
    with open('assets/data/glossary.json', 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))
    n = len(terms)
    w = sum(len(re.findall(r"[A-Za-z]+", t['g'])) for t in terms)
    print('  %d terms, %d words of explanation, %.1f KB'
          % (n, w, os.path.getsize('assets/data/glossary.json') / 1024))
    by = {}
    for t in terms:
        by[t['d']] = by.get(t['d'], 0) + 1
    print('  ' + '  '.join('%s %d' % (k, by[k]) for k in DOMAINS if k in by))

def check_file(path):
    """Validate a batch of entries written elsewhere, without touching the build.

    Several people writing glosses at once cannot all edit TERMS — the file is
    rewritten whole, so two overlapping edits silently lose one. They write
    tab-separated lines instead, and this holds them to exactly the same rules
    the build does:

        term <TAB> domain <TAB> alias,alias <TAB> explanation

    Blank lines and lines starting with # are ignored.
    """
    batch, seen = [], {t['t'] for t in TERMS}
    problems = []
    for n, line in enumerate(open(path, encoding='utf-8'), 1):
        line = line.rstrip('\n')
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        parts = line.split('\t')
        if len(parts) < 4:
            problems.append('line %d: needs four tab-separated fields' % n)
            continue
        term, dom, alias, gloss = (parts[0].strip(), parts[1].strip(),
                                   parts[2].strip(), parts[3].strip())
        if dom not in DOMAINS:
            problems.append('line %d: %r is not one of %s' % (n, dom, ', '.join(DOMAINS)))
            continue
        if term in seen:
            problems.append('line %d: %r is already in the glossary' % (n, term))
            continue
        seen.add(term)
        rec = {'t': term, 'd': dom, 'g': gloss}
        a = [x.strip() for x in alias.split(',') if x.strip()]
        if a:
            rec['alias'] = a
        batch.append(rec)
    problems += check(batch)
    if problems:
        print('%d problem(s) in %s:' % (len(problems), path))
        for p_ in problems:
            print('  ! ' + p_)
        sys.exit(1)
    print('%s: %d entries, all within the rules' % (path, len(batch)))


if __name__ == '__main__':
    if len(sys.argv) > 2 and sys.argv[1] == '--check':
        check_file(sys.argv[2])
    else:
        main(TERMS)
