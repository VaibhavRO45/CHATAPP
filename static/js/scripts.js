// scripts.js

function adjustPageSize() {
    const width = window.innerWidth;
    const body = document.body;

    if (width >= 992 && width <= 1600) {
        body.style.transform = "scale(0.9)";
    } else if (width >= 700 && width <= 767) {
        body.style.transform = "scale(0.8)";
    } else if (width >= 600 && width <= 700) {
        body.style.transform = "scale(0.75)";
    } else if (width <= 600) {
        body.style.transform = "scale(0.5)";
    } else {
        body.style.transform = "scale(1)"; // Default scale for larger screens
    }
}

window.addEventListener('resize', adjustPageSize);
window.addEventListener('load', adjustPageSize); // Run on page load


