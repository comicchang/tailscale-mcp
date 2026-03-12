#
# ---- Builder Stage ----
# This stage installs dependencies (including devDependencies)
# and builds the application source code.
#
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Copy package files and install all dependencies for the build
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Copy the rest of the application source code
COPY . .

# Run the build script to transpile TypeScript to JavaScript
RUN bun run build

# Remove dev dependencies
RUN bun install --production --frozen-lockfile

#
# ---- Production Stage ----
# This stage creates the final, lean image by copying only the
# necessary artifacts from the builder stage.
#
FROM oven/bun:1-alpine AS production

# Install dumb-init for proper PID 1 signal handling
RUN apk add --no-cache dumb-init

# Create a dedicated, non-root user and group for the application
RUN addgroup -S appgroup -g 1001 && \
  adduser -S appuser -u 1001 -G appgroup

WORKDIR /app

# Copy production dependencies from the builder stage. This is faster
# and more reliable than re-installing them.
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules

# Copy the compiled application code from the builder stage
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist

# Copy other project files like README and LICENSE
COPY --from=builder --chown=appuser:appgroup /app/README.md ./
COPY --from=builder --chown=appuser:appgroup /app/LICENSE ./

# Switch to the non-root user for enhanced security
USER appuser

# Expose the port the application will run on
EXPOSE 3000

# A basic health check to ensure the Node.js process can start.
# For a real-world app, this should hit a dedicated /health endpoint.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun -e "process.exit(0)" || exit 1

# Set environment variables for the production environment
ENV NODE_ENV=production
ENV LOG_LEVEL=1

# Use dumb-init as the entrypoint to manage the bun process
ENTRYPOINT ["dumb-init", "--"]

# The command to start the application
CMD ["bun", "dist/index.js"]
