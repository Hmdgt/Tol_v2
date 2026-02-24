document.getElementById("uploadBtn").addEventListener("click", () => {
  const file = document.getElementById("cameraInput").files[0];
  if (!file) {
    alert("Escolhe ou tira uma foto primeiro.");
    return;
  }
  uploadToGitHub(file);
});
