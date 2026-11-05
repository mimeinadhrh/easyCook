const API_BASE = "https://www.themealdb.com/api/json/v1/1";

const PLAN_KEY = "easycookMealPlans";
const SUGGESTION_KEY = "easycookSavedSuggestions";

let currentRecipes = [];
let editingPlanId = null;

document.addEventListener("DOMContentLoaded", () => {
  setupRecipeFinder();
  setupMealPlanner();
  setupCalculator();
});

// ---------- general helpers ----------

function getStoredData(key, fallback = []) {
  try {
    const data = JSON.parse(localStorage.getItem(key));
    return Array.isArray(data) ? data : fallback;
  } catch (error) {
    console.error("Unable to read Local Storage:", error);
    return fallback;
  }
}

function saveStoredData(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

async function fetchJSON(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("The server returned an error.");
  }

  return response.json();
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function showMessage(elementId, message, isError = false) {
  const element = document.getElementById(elementId);
  if (!element) return;

  element.textContent = message;
  element.classList.toggle("error", isError);
}

// ---------- recipe cards ----------

function recipeCard(recipe) {
  return `
    <article class="recipe-card">
      <img
        src="${escapeHTML(recipe.strMealThumb || "")}"
        alt="${escapeHTML(recipe.strMeal || "Recipe")}"
        loading="lazy"
      >
      <div class="recipe-card-content">
        <h3>${escapeHTML(recipe.strMeal)}</h3>
        <p>${escapeHTML(recipe.strCategory || "Recipe")}</p>
        <div class="card-actions">
          <button type="button" data-view="${escapeHTML(recipe.idMeal)}">
            View Recipe
          </button>
          <button type="button" class="secondary"
                  data-save="${escapeHTML(recipe.idMeal)}">
            Save Suggestion
          </button>
        </div>
      </div>
    </article>
  `;
}

function displayRecipes(elementId, recipes) {
  const container = document.getElementById(elementId);
  if (!container) return;

  if (!recipes || recipes.length === 0) {
    container.innerHTML = "<p>No recipes found. Try another search.</p>";
    return;
  }

  container.innerHTML = recipes.map(recipeCard).join("");
}

// ---------- recipe finder ----------

function setupRecipeFinder() {
  const searchForm = document.getElementById("searchForm");
  if (!searchForm) return;

  searchForm.addEventListener("submit", async event => {
    event.preventDefault();

    const query = document.getElementById("searchInput").value.trim();

    if (!query) {
      showMessage("statusMessage", "Please enter a recipe name.", true);
      return;
    }

    await searchRecipes(
      `${API_BASE}/search.php?s=${encodeURIComponent(query)}`
    );
  });

  document.getElementById("ingredientSearchBtn")
    .addEventListener("click", async () => {
      const ingredient = document.getElementById("ingredientInput").value.trim();

      if (!ingredient) {
        showMessage("statusMessage", "Please enter an ingredient.", true);
        return;
      }

      await searchRecipes(
        `${API_BASE}/filter.php?i=${encodeURIComponent(ingredient)}`,
        true
      );
    });

  document.getElementById("categorySelect")
    .addEventListener("change", async event => {
      const category = event.target.value;

      if (!category) {
        currentRecipes = [];
        displayRecipes("recipeResults", []);
        showMessage("statusMessage", "Choose a category or search for a recipe.");
        return;
      }

      await searchRecipes(
        `${API_BASE}/filter.php?c=${encodeURIComponent(category)}`,
        true
      );
    });

  document.getElementById("showSuggestionsBtn")
    .addEventListener("click", createSuggestions);

  document.getElementById("recipeResults")
    .addEventListener("click", handleRecipeActions);

  document.getElementById("suggestionResults")
    .addEventListener("click", handleRecipeActions);

  document.getElementById("savedRecipeResults")
    .addEventListener("click", handleSavedRecipeActions);

  document.getElementById("closeDialogBtn")
    .addEventListener("click", () => {
      document.getElementById("recipeDialog").close();
    });

  loadCategories();
  renderSavedRecipes();
}

async function loadCategories() {
  try {
    const data = await fetchJSON(`${API_BASE}/categories.php`);
    const select = document.getElementById("categorySelect");

    (data.categories || []).forEach(category => {
      const option = document.createElement("option");
      option.value = category.strCategory;
      option.textContent = category.strCategory;
      select.appendChild(option);
    });
  } catch (error) {
    showMessage(
      "statusMessage",
      "Unable to load categories. Check your internet connection.",
      true
    );
  }
}

async function searchRecipes(url, filtered = false) {
  showMessage("statusMessage", "Searching for recipes...");

  try {
    const data = await fetchJSON(url);
    let recipes = data.meals || [];

    if (filtered && recipes.length > 0) {
      recipes = await Promise.all(
        recipes.slice(0, 12).map(async recipe => {
          try {
            const details = await fetchJSON(
              `${API_BASE}/lookup.php?i=${encodeURIComponent(recipe.idMeal)}`
            );
            return details.meals?.[0] || recipe;
          } catch {
            return recipe;
          }
        })
      );
    }

    currentRecipes = recipes;
    displayRecipes("recipeResults", recipes);

    showMessage(
      "statusMessage",
      recipes.length
        ? `Found ${recipes.length} recipe(s).`
        : "No recipes found."
    );
  } catch (error) {
    showMessage(
      "statusMessage",
      "Could not load recipes. Please check your internet connection.",
      true
    );
  }
}

async function handleRecipeActions(event) {
  const viewButton = event.target.closest("[data-view]");
  const saveButton = event.target.closest("[data-save]");

  if (viewButton) {
    await showRecipeDetails(viewButton.dataset.view);
  }

  if (saveButton) {
    await saveSuggestion(saveButton.dataset.save);
  }
}

async function showRecipeDetails(id) {
  try {
    const data = await fetchJSON(
      `${API_BASE}/lookup.php?i=${encodeURIComponent(id)}`
    );

    const recipe = data.meals?.[0];
    if (!recipe) throw new Error("Recipe not found.");

    const ingredients = [];

    for (let i = 1; i <= 20; i++) {
      const ingredient = recipe[`strIngredient${i}`]?.trim();
      const measure = recipe[`strMeasure${i}`]?.trim();

      if (ingredient) {
        ingredients.push(`${measure || ""} ${ingredient}`.trim());
      }
    }

    const details = document.getElementById("recipeDetails");

    details.innerHTML = `
      <h2>${escapeHTML(recipe.strMeal)}</h2>
      <img class="detail-image"
           src="${escapeHTML(recipe.strMealThumb || "")}"
           alt="${escapeHTML(recipe.strMeal)}">
      <p><strong>Category:</strong>
         ${escapeHTML(recipe.strCategory || "Not specified")}</p>
      <p><strong>Area:</strong>
         ${escapeHTML(recipe.strArea || "Not specified")}</p>
      <h3>Ingredients</h3>
      <ul>${ingredients.map(item =>
        `<li>${escapeHTML(item)}</li>`
      ).join("")}</ul>
      <h3>Instructions</h3>
      <p class="instructions">
        ${escapeHTML(recipe.strInstructions || "No instructions available.")}
      </p>
      ${recipe.strSource
        ? `<p><a href="${escapeHTML(recipe.strSource)}"
             target="_blank" rel="noreferrer">Original source</a></p>`
        : ""}
    `;

    document.getElementById("recipeDialog").showModal();
  } catch (error) {
    showMessage("statusMessage", "Unable to display recipe details.", true);
  }
}

// ---------- preference-based suggestions ----------

async function createSuggestions() {
  const preference = document.getElementById("suggestionPreference").value;
  const button = document.getElementById("showSuggestionsBtn");
  const container = document.getElementById("suggestionResults");

  button.disabled = true;
  container.innerHTML = "";
  showMessage("suggestionStatus", "Finding recipes for you...");

  try {
    let recipes = [];

    if (preference === "random") {
      const requests = Array.from(
        { length: 6 },
        () => fetchJSON(`${API_BASE}/random.php`)
      );

      const results = await Promise.all(requests);
      recipes = results.flatMap(data => data.meals || []);
    } else {
      let url = "";

      if (preference === "chicken") {
        url = `${API_BASE}/filter.php?i=chicken`;
      } else if (preference === "seafood") {
        url = `${API_BASE}/filter.php?c=Seafood`;
      } else if (preference === "vegetarian") {
        url = `${API_BASE}/filter.php?c=Vegetarian`;
      } else if (preference === "beef") {
        url = `${API_BASE}/filter.php?i=beef`;
      } else {
        throw new Error("Invalid preference.");
      }

      const data = await fetchJSON(url);
      recipes = data.meals || [];
    }

    // Remove duplicate recipes
    recipes = recipes.filter(
      (recipe, index, array) =>
        array.findIndex(item => item.idMeal === recipe.idMeal) === index
    );

    // Shuffle suggestions
    for (let i = recipes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [recipes[i], recipes[j]] = [recipes[j], recipes[i]];
    }

    const suggestions = recipes.slice(0, 6);
    displayRecipes("suggestionResults", suggestions);

    showMessage(
      "suggestionStatus",
      suggestions.length
        ? `Found ${suggestions.length} suggested recipes.`
        : "No suggestions found."
    );
  } catch (error) {
    console.error(error);
    showMessage(
      "suggestionStatus",
      "Unable to load suggestions. Check your internet connection.",
      true
    );
  } finally {
    button.disabled = false;
  }
}

// ---------- save suggestion ----------

async function saveSuggestion(id) {
  try {
    const data = await fetchJSON(
      `${API_BASE}/lookup.php?i=${encodeURIComponent(id)}`
    );

    const recipe = data.meals?.[0];
    if (!recipe) throw new Error("Recipe not found.");

    const saved = getStoredData(SUGGESTION_KEY);

    if (saved.some(item => item.idMeal === recipe.idMeal)) {
      showMessage("savedRecipeStatus", "This recipe is already saved.");
      return;
    }

    saved.push({
      idMeal: recipe.idMeal,
      strMeal: recipe.strMeal,
      strMealThumb: recipe.strMealThumb,
      strCategory: recipe.strCategory || "Recipe",
      savedAt: new Date().toISOString()
    });

    saveStoredData(SUGGESTION_KEY, saved);
    renderSavedRecipes();

    showMessage(
      "savedRecipeStatus",
      `${recipe.strMeal} saved successfully.`
    );
  } catch (error) {
    showMessage("savedRecipeStatus", "Unable to save this recipe.", true);
  }
}

// ---------- save recipe ----------

function renderSavedRecipes() {
  const container = document.getElementById("savedRecipeResults");
  if (!container) return;

  const saved = getStoredData(SUGGESTION_KEY);

  if (saved.length === 0) {
    container.innerHTML =
      "<p>No saved recipes yet. Save your favourite recipes!</p>";
    return;
  }

  container.innerHTML = saved.map(recipe => `
    <article class="recipe-card">
      <img
        src="${escapeHTML(recipe.strMealThumb || "")}"
        alt="${escapeHTML(recipe.strMeal)}"
        loading="lazy"
      >
      <div class="recipe-card-content">
        <h3>${escapeHTML(recipe.strMeal)}</h3>
        <p>${escapeHTML(recipe.strCategory)}</p>
        <div class="card-actions">
          <button type="button"
                  data-view="${escapeHTML(recipe.idMeal)}">
            View Recipe
          </button>
          <button type="button" class="danger"
                  data-remove-saved="${escapeHTML(recipe.idMeal)}">
            Remove
          </button>
        </div>
      </div>
    </article>
  `).join("");
}

async function handleSavedRecipeActions(event) {
  const viewButton = event.target.closest("[data-view]");
  const removeButton = event.target.closest("[data-remove-saved]");

  if (viewButton) {
    await showRecipeDetails(viewButton.dataset.view);
  }

  if (removeButton) {
    removeSavedRecipe(removeButton.dataset.removeSaved);
  }
}

function removeSavedRecipe(id) {
  const saved = getStoredData(SUGGESTION_KEY);
  const recipe = saved.find(item => item.idMeal === id);

  if (!recipe) return;

  if (confirm(`Remove "${recipe.strMeal}" from saved recipes?`)) {
    const updated = saved.filter(item => item.idMeal !== id);

    saveStoredData(SUGGESTION_KEY, updated);
    renderSavedRecipes();

    showMessage(
      "savedRecipeStatus",
      "Recipe removed successfully."
    );
  }
}

// ---------- Page 2: CRUD for meal planner ----------

function setupMealPlanner() {
  const form = document.getElementById("mealPlanForm");
  if (!form) return;

  form.addEventListener("submit", event => {
    event.preventDefault();
    saveMealPlan();
  });

  document.getElementById("cancelEditBtn")
    .addEventListener("click", resetPlanForm);

  document.getElementById("clearPlansBtn")
    .addEventListener("click", () => {
      const plans = getStoredData(PLAN_KEY);

      if (!plans.length) {
        showMessage(
          "plannerStatus",
          "There are no meal plans to clear."
        );
        return;
      }

      if (confirm("Are you sure you want to delete all meal plans?")) {
        saveStoredData(PLAN_KEY, []);
        renderMealPlans();
        resetPlanForm();
        showMessage("plannerStatus", "All meal plans deleted.");
      }
    });

  document.getElementById("mealPlanResults")
    .addEventListener("click", handlePlanActions);

  renderMealPlans();
}


// ---------- save meal plan ----------

function saveMealPlan() {
  const name = document.getElementById("planName").value.trim();
  const day = document.getElementById("planDay").value;
  const type = document.getElementById("planMealType").value;
  const servings = Number(document.getElementById("planServings").value);
  const notes = document.getElementById("planNotes").value.trim();

  if (
    !name ||
    !day ||
    !type ||
    !Number.isInteger(servings) ||
    servings < 1 ||
    servings > 50
  ) {
    showMessage(
      "plannerStatus",
      "Please complete all required fields correctly.",
      true
    );
    return;
  }

  const plans = getStoredData(PLAN_KEY);

  if (editingPlanId) {
    const index = plans.findIndex(
      plan => plan.id === editingPlanId
    );

    if (index !== -1) {
      plans[index] = {
        ...plans[index],
        name,
        day,
        type,
        servings,
        notes
      };
    }

    showMessage(
      "plannerStatus",
      "Meal plan updated successfully."
    );

  } else {
    plans.push({
      id: Date.now().toString(),
      name,
      day,
      type,
      servings,
      notes,
      createdAt: new Date().toISOString()
    });

    showMessage(
      "plannerStatus",
      "Meal plan saved successfully."
    );
  }

  saveStoredData(PLAN_KEY, plans);
  renderMealPlans();
  resetPlanForm();
}


// ---------- display meal plans ----------

function renderMealPlans() {
  const container = document.getElementById("mealPlanResults");
  if (!container) return;

  const plans = getStoredData(PLAN_KEY);

  if (!plans.length) {
    container.innerHTML =
      "<p>No meal plans yet. Add your first plan above!</p>";
    return;
  }

  const days = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday"
  ];

  plans.sort(
    (a, b) => days.indexOf(a.day) - days.indexOf(b.day)
  );

  container.innerHTML = plans.map(plan => `
    <article class="plan-card">
      <div>
        <span class="plan-tag">
          ${escapeHTML(plan.day)} · ${escapeHTML(plan.type)}
        </span>

        <h3>${escapeHTML(plan.name)}</h3>

        <p>Servings: ${Number(plan.servings)}</p>

        ${plan.notes
          ? `<p>${escapeHTML(plan.notes)}</p>`
          : ""}
      </div>

      <div class="card-actions">
        <button
          type="button"
          data-edit-plan="${escapeHTML(plan.id)}"
        >
          Edit
        </button>

        <button
          type="button"
          class="danger"
          data-delete-plan="${escapeHTML(plan.id)}"
        >
          Delete
        </button>
      </div>
    </article>
  `).join("");
}


// ---------- handle meal plan actions ----------

function handlePlanActions(event) {
  const editButton = event.target.closest("[data-edit-plan]");
  const deleteButton = event.target.closest("[data-delete-plan]");

  if (editButton) {
    editMealPlan(editButton.dataset.editPlan);
  }

  if (deleteButton) {
    deleteMealPlan(deleteButton.dataset.deletePlan);
  }
}


// ---------- edit meal plan ----------

function editMealPlan(id) {
  const plan = getStoredData(PLAN_KEY).find(
    item => item.id === id
  );

  if (!plan) return;

  editingPlanId = id;

  document.getElementById("planName").value = plan.name;
  document.getElementById("planDay").value = plan.day;
  document.getElementById("planMealType").value = plan.type;
  document.getElementById("planServings").value = plan.servings;
  document.getElementById("planNotes").value = plan.notes || "";

  document.querySelector(
    "#mealPlanForm button[type='submit']"
  ).textContent = "Update Meal Plan";

  document.getElementById("cancelEditBtn")
    .classList.remove("hidden");

  showMessage(
    "plannerStatus",
    "Edit the details and click Update Meal Plan."
  );

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


// ---------- delete meal plan ----------

function deleteMealPlan(id) {
  const plans = getStoredData(PLAN_KEY);
  const plan = plans.find(item => item.id === id);

  if (!plan) return;

  if (confirm(`Delete "${plan.name}" from your meal plan?`)) {
    saveStoredData(
      PLAN_KEY,
      plans.filter(item => item.id !== id)
    );

    renderMealPlans();

    if (editingPlanId === id) {
      resetPlanForm();
    }

    showMessage(
      "plannerStatus",
      "Meal plan deleted successfully."
    );
  }
}


// ---------- reset meal plan form ----------

function resetPlanForm() {
  const form = document.getElementById("mealPlanForm");
  if (!form) return;

  form.reset();
  editingPlanId = null;

  document.getElementById("planServings").value = 2;

  document.querySelector(
    "#mealPlanForm button[type='submit']"
  ).textContent = "Save Meal Plan";

  document.getElementById("cancelEditBtn")
    .classList.add("hidden");
}


// ---------- recipe cost calculations ----------

function setupCalculator() {
  const addButton = document.getElementById("addIngredientBtn");
  const calculateButton = document.getElementById("calculateBtn");
  const ingredientRows = document.getElementById("ingredientRows");

  if (!addButton || !calculateButton || !ingredientRows) {
    return;
  }

  // Add new ingredient
  addButton.addEventListener("click", addIngredient);

  // Calculate recipe cost
  calculateButton.addEventListener("click", calculateCost);

  // Remove ingredient
  ingredientRows.addEventListener("click", event => {
    if (event.target.classList.contains("remove-ingredient")) {
      const rows = ingredientRows.querySelectorAll(
        ".ingredient-row"
      );

      if (rows.length <= 1) {
        showMessage(
          "calculationResult",
          "At least one ingredient is required.",
          true
        );
        return;
      }

      event.target.closest(".ingredient-row").remove();

      showMessage("calculationResult", "");
    }
  });
}


// ---------- add ingredient ----------

function addIngredient() {
  const container = document.getElementById("ingredientRows");

  const row = document.createElement("div");
  row.className = "calculator-row ingredient-row";

  row.innerHTML = `
    <label>
      Ingredient Name
      <input
        type="text"
        class="ingredient-name"
        placeholder="e.g. Fish"
      >
    </label>

    <label>
      Cost (RM)
      <input
        type="number"
        class="ingredient-cost"
        min="0"
        step="0.01"
        placeholder="e.g. 8.00"
      >
    </label>

    <button
      type="button"
      class="secondary remove-ingredient"
    >
      Remove
    </button>
  `;

  container.appendChild(row);

  showMessage("calculationResult", "");
}


// ---------- calculate recipe cost ----------

function calculateCost() {
  const rows = document.querySelectorAll(".ingredient-row");
  const servingsInput = document.getElementById("servings");

  if (!rows.length || !servingsInput) {
    return;
  }

  const servingsText = servingsInput.value.trim();
  const servings = Number(servingsText);

  // Validate servings
  if (
    servingsText === "" ||
    !Number.isInteger(servings) ||
    servings <= 0
  ) {
    showMessage(
      "calculationResult",
      "Please enter a valid number of servings.",
      true
    );
    return;
  }

  let totalCost = 0;

  // Loop through every ingredient
  for (const row of rows) {
    const name = row.querySelector(
      ".ingredient-name"
    ).value.trim();

    const costText = row.querySelector(
      ".ingredient-cost"
    ).value.trim();

    const cost = Number(costText);

    // Validate ingredient
    if (
      !name ||
      costText === "" ||
      !Number.isFinite(cost) ||
      cost < 0
    ) {
      showMessage(
        "calculationResult",
        "Please enter a name and valid cost for every ingredient.",
        true
      );
      return;
    }

    totalCost += cost;
  }

  // Calculate cost per serving
  const costPerServing = totalCost / servings;

  // Display results
  showMessage(
    "calculationResult",
    `Total Recipe Cost: RM ${totalCost.toFixed(2)} | Cost Per Serving: RM ${costPerServing.toFixed(2)}`
  );
}