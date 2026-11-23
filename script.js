const menuButton = document.querySelector(".menu-button");
const menu = document.querySelector(".nav");
const isEnglish = window.location.pathname.split("/").includes("en");

if (menuButton && menu) {
  const pathParts = window.location.pathname.split("/").filter(Boolean);
  const currentFile = window.location.pathname.split("/").pop() || "index.html";
  document.documentElement.lang = isEnglish ? "en" : "ru";

  if (!menu.querySelector(".language-switch")) {
    const ruFile = isEnglish ? `../${currentFile}` : `${currentFile}`;
    const enFile = isEnglish ? currentFile : `en/${currentFile}`;
    const switcher = document.createElement("span");
    switcher.className = "language-switch";
    switcher.innerHTML = isEnglish
      ? `<a href="${ruFile}" lang="ru">RU</a><span>/</span><a href="${enFile}" class="active" lang="en" aria-current="page">EN</a>`
      : `<a href="${ruFile}" class="active" lang="ru" aria-current="page">RU</a><span>/</span><a href="${enFile}" lang="en">EN</a>`;
    menu.appendChild(switcher);
  }
  menu.querySelectorAll("a").forEach((link) => {
    const linkFile = link.getAttribute("href").split("#")[0];
    if (linkFile === currentFile || (currentFile === "" && linkFile === "index.html")) {
      link.setAttribute("aria-current", "page");
    }
    link.addEventListener("click", () => {
      menu.classList.remove("open");
      menuButton.setAttribute("aria-expanded", "false");
    });
  });

  menuButton.addEventListener("click", () => {
    const open = menu.classList.toggle("open");
    menuButton.setAttribute("aria-expanded", String(open));
  });
}

const footer = document.querySelector("#site-footer");
if (footer) {
  footer.innerHTML = `
    <div>
      <p class="footer-title">${isEnglish ? "Start your practice" : "Начнём практику?"}</p>
      <div class="social-links">
        <a href="https://t.me/alinamanuilova" target="_blank" rel="noopener">Telegram ↗</a>
        <a href="https://youtube.com/@alinamanuilova?si=CtinvBpgB77mdxNF" target="_blank" rel="noopener">YouTube ↗</a>
      </div>
    </div>
  `;
}

const leadForm = document.querySelector("#lead-form");
if (leadForm) {
  const consent = leadForm.elements.consent;
  const submitButton = leadForm.querySelector('button[type="submit"]');
  const subjectPicker = leadForm.querySelector(".subject-picker");
  const subjectMenu = leadForm.querySelector(".subject-menu");
  const subjectValue = leadForm.querySelector(".subject-value");
  const subjectInput = leadForm.elements.subject;

  const updateSubmitState = () => {
    submitButton.disabled = !consent.checked || !subjectInput.value;
  };

  if (subjectPicker && subjectMenu) {
    const subjectParam = new URLSearchParams(window.location.search).get("subject");
    if (subjectParam === "certificate") {
      subjectValue.textContent = "Сертификат";
      subjectInput.value = "Сертификат";
      updateSubmitState();
    }
    subjectPicker.addEventListener("click", () => {
      const open = subjectMenu.hidden;
      subjectMenu.hidden = !open;
      subjectPicker.setAttribute("aria-expanded", String(open));
    });
    subjectMenu.querySelectorAll("[data-value]").forEach((option) => {
      option.addEventListener("click", () => {
        const value = option.dataset.value;
        subjectValue.textContent = value;
        subjectInput.value = value;
        subjectMenu.hidden = true;
        subjectPicker.setAttribute("aria-expanded", "false");
        updateSubmitState();
        subjectPicker.focus();
      });
    });
  }

  consent.addEventListener("change", () => {
    updateSubmitState();
  });

  leadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = document.querySelector("#form-status");
    const submit = leadForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = "Отправляем...";
    try {
      const response = await fetch(leadForm.action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: leadForm.elements.name.value,
          email: leadForm.elements.email.value,
          subject: leadForm.elements.subject ? leadForm.elements.subject.value : "",
          consent: leadForm.elements.consent.checked,
          website: leadForm.elements.website.value
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Не удалось отправить заявку");
      leadForm.reset();
      submit.disabled = true;
      status.textContent = isEnglish ? "Thank you, your enquiry has been received." : "Спасибо, ваша заявка принята.";
      submit.textContent = "Получено";
    } catch (error) {
      status.textContent = error.message;
      submit.disabled = false;
      submit.innerHTML = isEnglish ? 'Send enquiry <span>↗</span>' : 'Отправить заявку <span>↗</span>';
    }
  });
}
