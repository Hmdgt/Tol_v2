// Abre a câmara ao tocar no botão central
document.getElementById("cameraButton").addEventListener("click", () => {
  document.getElementById("cameraInput").click();
});

// Quando a foto é tirada → upload automático
document.getElementById("cameraInput").addEventListener("change", () => {
  const file = document.getElementById("cameraInput").files[0];
  if (file) uploadToGitHub(file);
});
