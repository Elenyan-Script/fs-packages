# Getting Started

## Installation

All packages are published to the public npm registry under the `@script-development` scope. Install what you need:

```bash
npm install @script-development/fs-http
```

Vue-dependent packages declare `vue` as a peer dependency — your project must already have Vue installed.

```bash
# Foundation (no Vue required)
npm install @script-development/fs-http
npm install @script-development/fs-storage
npm install @script-development/fs-helpers

# Integrations (no Vue required; fs-cloudflare is server-side)
npm install @script-development/fs-cloudflare

# Services (Vue required)
npm install @script-development/fs-theme
npm install @script-development/fs-loading
npm install @script-development/fs-toast
npm install @script-development/fs-dialog
npm install @script-development/fs-translation

# Domain (Vue required)
npm install @script-development/fs-adapter-store
npm install @script-development/fs-router

# UI Components (Vue required)
npm install @script-development/ui-inputs
```

## Your First Service

Every package follows the same pattern: import a factory function, call it, use the returned service object.

```typescript
import {createHttpService} from '@script-development/fs-http';

// Create a service — you own the instance
const http = createHttpService('https://api.example.com');

// Use it
const response = await http.getRequest<User[]>('/users');
```

That's the entire mental model. No classes to extend, no providers to register, no global state to configure. You call a factory, you get an object with methods, you use it.

## How Packages Compose

Packages are designed to work together through **composition**, not inheritance. You wire them up yourself — the connections are explicit, never hidden.

Here's a realistic setup that shows how services layer on top of each other:

```typescript
import {createHttpService} from '@script-development/fs-http';
import {createStorageService} from '@script-development/fs-storage';
import {createLoadingService, registerLoadingMiddleware} from '@script-development/fs-loading';
import {createThemeService} from '@script-development/fs-theme';

// 1. Create foundation services
const http = createHttpService('https://api.example.com');
const storage = createStorageService('myapp');

// 2. Create loading service and wire it to HTTP
const loading = createLoadingService();
registerLoadingMiddleware(http, loading);
// Now every HTTP request automatically tracks loading state

// 3. Create theme service using storage for persistence
const theme = createThemeService(storage);
// Theme preference is saved to localStorage under "myapp:theme"
```

Notice how each line is a deliberate wiring decision. There's no magic — if loading tracks HTTP requests, it's because you explicitly registered the middleware. If theme persists to storage, it's because you passed the storage service in.

::: tip Why explicit wiring?
When something breaks, the wiring is right there in your setup code — not buried in a framework configuration file, a service provider, or a decorator chain. Juniors can trace the full data flow. Seniors can reason about it without grepping the entire codebase.
:::

## Using Services in Vue Components

Services are plain objects with reactive properties. Use them in Vue components like any other reactive state:

```vue
<script setup lang="ts">
import {loading} from '@/services'; // your app's service setup file

// loading.isLoading is a ComputedRef<boolean> — it just works in templates
</script>

<template>
    <div v-if="loading.isLoading.value" class="spinner">Loading...</div>
    <slot v-else />
</template>
```

## Typical App Setup

In practice, you create all services once in a setup file and export them for use across your application:

```typescript
// services/index.ts
import {createHttpService} from '@script-development/fs-http';
import {createStorageService} from '@script-development/fs-storage';
import {createLoadingService, registerLoadingMiddleware} from '@script-development/fs-loading';
import {createThemeService} from '@script-development/fs-theme';
import {createToastService} from '@script-development/fs-toast';
import {createDialogService} from '@script-development/fs-dialog';
import {createTranslationService} from '@script-development/fs-translation';
import MyToastComponent from '@/components/MyToast.vue';

// Foundation
export const http = createHttpService('https://api.example.com');
export const storage = createStorageService('myapp');

// Loading — wired to HTTP
export const loading = createLoadingService();
registerLoadingMiddleware(http, loading);

// Theme — wired to storage
export const theme = createThemeService(storage);

// Toast — you bring the component
export const toast = createToastService(MyToastComponent);

// Dialog
export const dialog = createDialogService();

// Translation
export const translation = createTranslationService({en: {common: {save: 'Save', cancel: 'Cancel'}}}, 'en');
```

Then import what you need in any component or composable:

```typescript
import {http, toast} from '@/services';

async function saveUser(data: UserData) {
    await http.postRequest('/users', data);
    toast.show({message: 'User saved', type: 'success'});
}
```

## What's Next

- **[Architecture](/architecture)** — Understand the design decisions behind the factory pattern, loose coupling, and middleware composition
- **[Package docs](/packages/http)** — Explore each package's full API with examples
- **[Contributing](/contributing)** — Learn how to contribute packages and navigate the CI pipeline
