// The "Something fun" page: a smiley that changes face and message when clicked.

const faces = ["😀", "😄", "😁", "😆", "😊", "🥳", "😎", "🤩", "😜", "🤓"];
const messages = [
  "Keep reading! 📖",
  "One more chapter… 😏",
  "You're doing great!",
  "Books are the best ✨",
  "Reading streak: legendary",
  "Bookworm mode: ON 🐛",
  "Have a lovely day!",
];
const smiley = document.getElementById("smiley");
const message = document.getElementById("fun-message");

// A random item from the list, different from the current one.
const pick = (list, not) => {
  let item;
  do item = list[Math.floor(Math.random() * list.length)];
  while (item === not && list.length > 1);
  return item;
};

smiley.addEventListener("click", () => {
  smiley.textContent = pick(faces, smiley.textContent);
  message.textContent = pick(messages, message.textContent);
  smiley.classList.remove("spin");
  void smiley.offsetWidth; // restart the animation
  smiley.classList.add("spin");
});
