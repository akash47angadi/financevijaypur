/* Basic Information page fixes for 1.html.
 * Load this script after the existing form markup and before </body>.
 */
document.addEventListener("DOMContentLoaded", () => {
  const MAX_IMAGE_BYTES = 512 * 1024;
  const $ = id => document.getElementById(id);

  const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[ch]));

  // State/district data comes from the repository JSON. The timestamp avoids
  // GitHub Pages/browser cache when the JSON is edited during development.
  const loadGeography = async () => {
    const response = await fetch(`./india-states-districts-latest.json?v=${Date.now()}`, {
      cache: "no-store"
    });
    if (!response.ok) throw new Error("Unable to load geographic data");
    return response.json();
  };

  const fillDistricts = (stateId, districtId, geography, selected = "") => {
    const state = $(stateId);
    const district = $(districtId);
    if (!state || !district) return;
    const row = geography.find(item => item.state === state.value);
    const districts = row?.districts || [];
    district.innerHTML = '<option value="">Select District</option>' +
      districts.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
    district.disabled = !row;
    if (districts.includes(selected)) district.value = selected;
  };

  const setupGeography = async () => {
    const postalState = $("postalState");
    const postalDistrict = $("postalDistrict");
    const permanentState = $("permanentState");
    const permanentDistrict = $("permanentDistrict");
    if (!postalState || !postalDistrict) return;

    try {
      const geography = await loadGeography();
      const states = '<option value="">Select State</option>' + geography.map(item =>
        `<option value="${escapeHtml(item.state)}">${escapeHtml(item.state)}</option>`).join("");

      const postalStateValue = postalState.value;
      const permanentStateValue = permanentState?.value || "";
      postalState.innerHTML = states;
      if (geography.some(item => item.state === postalStateValue)) postalState.value = postalStateValue;
      if (permanentState) {
        permanentState.innerHTML = states;
        if (geography.some(item => item.state === permanentStateValue)) permanentState.value = permanentStateValue;
      }

      postalState.addEventListener("change", () => {
        fillDistricts("postalState", "postalDistrict", geography);
        if ($("sameAsPostal")?.checked) copyPostalToPermanent();
      });
      permanentState?.addEventListener("change", () => fillDistricts("permanentState", "permanentDistrict", geography));
      fillDistricts("postalState", "postalDistrict", geography, postalDistrict.value);
      fillDistricts("permanentState", "permanentDistrict", geography, permanentDistrict?.value || "");
    } catch (error) {
      console.error(error);
      const message = $("postalStateError");
      if (message) message.textContent = "Unable to load states and districts. Please refresh the page.";
    }
  };

  const copyPostalToPermanent = () => {
    const pairs = [
      ["postalState", "permanentState"],
      ["postalDistrict", "permanentDistrict"],
      ["postalTaluk", "permanentTaluk"],
      ["postalPincode", "permanentPincode"],
      ["postalAddress", "permanentAddress"]
    ];
    pairs.forEach(([from, to]) => {
      if ($(from) && $(to)) $(to).value = $(from).value;
    });
  };

  $("sameAsPostal")?.addEventListener("change", event => {
    if (event.target.checked) copyPostalToPermanent();
  });
  ["postalState", "postalDistrict", "postalTaluk", "postalPincode", "postalAddress"].forEach(id =>
    $(id)?.addEventListener("input", () => { if ($('sameAsPostal')?.checked) copyPostalToPermanent(); })
  );
  ["postalState", "postalDistrict"].forEach(id =>
    $(id)?.addEventListener("change", () => { if ($('sameAsPostal')?.checked) copyPostalToPermanent(); })
  );
  setupGeography();

  let activeInput = null;
  let cropper = null;
  const cropModal = $("cropModal");
  const cropImage = $("cropImage");

  const showFileError = (input, message) => {
    const error = $(`${input.id}Error`);
    if (error) error.textContent = `⚠ ${message}`;
  };

  const clearFileError = input => {
    const error = $(`${input.id}Error`);
    if (error) error.textContent = "";
  };

  const closeCropper = () => {
    cropper?.destroy();
    cropper = null;
    if (cropModal) cropModal.classList.add("hidden");
    if (cropImage) cropImage.removeAttribute("src");
    activeInput = null;
  };

  ["candidatePhoto", "candidateSign"].forEach(id => {
    const input = $(id);
    const preview = $(`${id}Preview`);
    if (!input) return;

    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        input.value = "";
        showFileError(input, "Please select an image file");
        return;
      }
      if (file.size >= MAX_IMAGE_BYTES) {
        input.value = "";
        showFileError(input, "File size must be less than 512 KB");
        if (preview) preview.classList.add("hidden");
        return;
      }

      clearFileError(input);
      const reader = new FileReader();
      reader.onload = () => {
        if (preview) {
          preview.src = reader.result;
          preview.classList.remove("hidden");
        }
        if (cropModal && cropImage && typeof window.Cropper === "function") {
          activeInput = input;
          cropImage.src = reader.result;
          cropModal.classList.remove("hidden");
          cropper = new Cropper(cropImage, {
            viewMode: 1,
            responsive: true,
            autoCropArea: 1,
            aspectRatio: id === "candidateSign" ? 3 / 1 : 1
          });
        }
      };
      reader.readAsDataURL(file);
    });
  });

  $("cropCancel")?.addEventListener("click", closeCropper);
  $("cropConfirm")?.addEventListener("click", () => {
    if (!cropper || !activeInput) return closeCropper();
    cropper.getCroppedCanvas({ maxWidth: 1200, maxHeight: 1200 }).toBlob(blob => {
      if (!blob || blob.size >= MAX_IMAGE_BYTES) {
        showFileError(activeInput, "Cropped image must be less than 512 KB");
        return;
      }
      const file = new File([blob], `${activeInput.id}-cropped.jpg`, { type: "image/jpeg" });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      activeInput.files = transfer.files;
      const preview = $(`${activeInput.id}Preview`);
      if (preview) {
        preview.src = URL.createObjectURL(file);
        preview.classList.remove("hidden");
      }
      clearFileError(activeInput);
      closeCropper();
    }, "image/jpeg", 0.9);
  });

  const updateAge = () => {
    const dob = $("dateOfBirth");
    const display = $("ageDisplay");
    if (!dob?.value) {
      if (display) display.textContent = "";
      return true;
    }
    const birth = new Date(`${dob.value}T00:00:00`);
    const today = new Date();
    if (Number.isNaN(birth.getTime()) || birth > today) return false;
    let years = today.getFullYear() - birth.getFullYear();
    let months = today.getMonth() - birth.getMonth();
    let days = today.getDate() - birth.getDate();
    if (days < 0) { months--; days += new Date(today.getFullYear(), today.getMonth(), 0).getDate(); }
    if (months < 0) { years--; months += 12; }
    if (display) {
      display.textContent = `Age : ${years} Years ${months} Months ${days} Days`;
      display.classList.remove("hidden");
      display.classList.add("text-green-600");
    }
    return true;
  };
  $("dateOfBirth")?.addEventListener("change", updateAge);
  $("dateOfBirth")?.addEventListener("input", updateAge);
  updateAge();

  const requiredFields = [
    ["candidateFName", "Please Provide First Name"],
    ["parentName", "Please Provide Father Name"],
    ["gender", "Please Select Gender"],
    ["casteCategory", "Please Select Category"],
    ["dateOfBirth", "Please Provide Date of Birth"],
    ["candidateMobile", "Please Provide Mobile Number"],
    ["postalState", "Please Select State"],
    ["postalDistrict", "Please Select District"],
    ["postalTaluk", "Please Provide Taluk"],
    ["postalPincode", "Please Provide PIN Code"],
    ["postalAddress", "Please Provide Postal Address"],
    ["permanentState", "Please Select Permanent State"],
    ["permanentDistrict", "Please Select Permanent District"],
    ["permanentTaluk", "Please Provide Permanent Taluk"],
    ["permanentPincode", "Please Provide Permanent PIN Code"],
    ["permanentAddress", "Please Provide Permanent Address"],
    ["casteReligion", "Please Provide Religion/Caste"],
    ["nationality", "Please Provide Nationality"],
    ["aadharNumber", "Please Provide Aadhaar Number"]
  ];

  const validate = () => {
    let valid = true;
    requiredFields.forEach(([id, message]) => {
      const input = $(id);
      const error = $(`${id}Error`);
      if (!input) return;
      if (!String(input.value || "").trim()) {
        valid = false;
        if (error) error.textContent = `⚠ ${message}`;
      } else if (error) error.textContent = "";
    });
    const mobile = $("candidateMobile");
    if (mobile?.value && !/^\d{10}$/.test(mobile.value.trim())) {
      valid = false; showFileError(mobile, "Please Provide a valid 10 digit Mobile Number");
    }
    const pincode = $("postalPincode");
    if (pincode?.value && !/^\d{6}$/.test(pincode.value.trim())) {
      valid = false; showFileError(pincode, "Please Provide a valid 6 digit PIN Code");
    }
    if (!updateAge()) valid = false;
    return valid;
  };

  // Document capture listener runs before legacy button handlers and prevents
  // navigation when any required field is missing.
  document.addEventListener("click", event => {
    const next = event.target.closest(".next-btn-basic");
    if (!next) return;
    if (!validate()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const data = {};
    requiredFields.forEach(([id]) => { if ($(id)) data[id] = $(id).value; });
    sessionStorage.setItem("basicInformation", JSON.stringify(data));
    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.href = "2.html";
  }, true);
});
