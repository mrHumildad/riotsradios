# Changelog y Release (Para Dummies)

Guía sencilla para actualizar el changelog y hacer release de riotsradios.

## Changelog con Changeset

Este proyecto usa **changeset** para gestionar el changelog automáticamente.

### Paso 1: Añadir un changeset

```bash
npm run changeset
```

Esto te hará preguntas:
- **Tipo de cambio**: `patch` (bug fix), `minor` (nueva funcionalidad) o `major` (cambio grande)
- **Mensaje**: Describe qué cambió (ej: "Añadida nueva estación de radio")

Se creará un archivo en `.changeset/` con tu cambio.

### Paso 2: Editar el changeset (opcional)

Los archivos de changeset están en `.changeset/` y tienen formato:
- `tu-mensaje.patch.md`
- `tu-mensaje.minor.md`
- `tu-mensaje.major.md`

Puedes editar el mensaje antes de hacer commit.

## Release (Publicar versión nueva)

Para publicar una nueva versión y actualizar el changelog:

```bash
npm run release
```

Esto hace **todo automáticamente**:
1. Actualiza el número de versión en `package.json`
2. Actualiza `CHANGELOG.md` con los cambios
3. Crea un commit con el version bump
4. Crea un tag de git
5. Sube los cambios a GitHub
6. Deploya a GitHub Pages

## Resumen rápido

| Acción | Comando |
|--------|---------|
| Añadir cambio al changelog | `npm run changeset` |
| Publicar nueva versión | `npm run release` |

¡Eso es todo!