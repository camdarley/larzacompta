# Image unique de l'application (AD-21) : serveur, binaire `ape` et restic, en utilisateur non root.

FROM node:26.13.0-bookworm-slim AS construction
WORKDIR /app
RUN npm install --global pnpm@12.16.1
COPY . .
# L'archive sert le code exact de ce build : elle se fait avant toute construction.
RUN tar --create --gzip --file /tmp/code-source.tar.gz --exclude=node_modules .
RUN pnpm install --frozen-lockfile
RUN pnpm build

# Une installation à neuf : élaguer celle du build laisse les outils de développement sur le disque.
FROM node:26.13.0-bookworm-slim AS dependances
WORKDIR /app
RUN npm install --global pnpm@12.16.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM node:26.13.0-bookworm-slim AS restic
ARG RESTIC_VERSION=0.19.1
# Sommes publiées par restic : un binaire modifié fait échouer la construction.
ARG RESTIC_SHA256_AMD64=f415415624dcc452f2a02b8c33641791a8c6d6d3b65bbb3543fcf9a25151585c
ARG RESTIC_SHA256_ARM64=a5f64aaab53d51e311fa3829124c5b703f2d14cf187d8640b6be3b2b49376465
RUN apt-get update \
	&& apt-get install --yes --no-install-recommends bzip2 ca-certificates \
	&& architecture="$(dpkg --print-architecture)" \
	&& case "$architecture" in \
		amd64) somme="$RESTIC_SHA256_AMD64" ;; \
		arm64) somme="$RESTIC_SHA256_ARM64" ;; \
		*) echo "Architecture non prise en charge : $architecture" >&2; exit 1 ;; \
	esac \
	&& fichier="restic_${RESTIC_VERSION}_linux_${architecture}.bz2" \
	&& node -e "fetch(process.argv[1]).then(async (r) => { if (!r.ok) throw new Error(r.status); process.stdout.write(Buffer.from(await r.arrayBuffer())); })" \
		"https://github.com/restic/restic/releases/download/v${RESTIC_VERSION}/${fichier}" > "/tmp/${fichier}" \
	&& echo "${somme}  /tmp/${fichier}" | sha256sum --check --strict \
	&& bunzip2 --stdout "/tmp/${fichier}" > /usr/local/bin/restic \
	&& chmod 0755 /usr/local/bin/restic

FROM node:26.13.0-bookworm-slim
ARG APE_REVISION=""
ENV NODE_ENV=production \
	HOST=0.0.0.0 \
	PORT=3000 \
	APE_DONNEES=/data \
	APE_MIGRATIONS=/app/migrations \
	APE_POLICES=/app/static/polices-pdf \
	APE_CODE_SOURCE=/app/code-source.tar.gz \
	APE_SAUVEGARDE=1 \
	RESTIC_CACHE_DIR=/data/sauvegardes/cache \
	APE_REVISION=${APE_REVISION}
WORKDIR /app
RUN apt-get update \
	&& apt-get install --yes --no-install-recommends ca-certificates \
	&& rm -rf /var/lib/apt/lists/*
COPY --from=restic /usr/local/bin/restic /usr/local/bin/restic
COPY --from=construction /app/build ./build
COPY --from=dependances /app/node_modules ./node_modules
COPY --from=construction /app/package.json ./package.json
COPY --from=construction /app/migrations ./migrations
COPY --from=construction /app/static/polices-pdf ./static/polices-pdf
COPY --from=construction /tmp/code-source.tar.gz ./code-source.tar.gz
RUN printf '#!/bin/sh\nexec node /app/build/cli/ape.js "$@"\n' > /usr/local/bin/ape \
	&& chmod 0755 /usr/local/bin/ape \
	&& mkdir /data \
	&& chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/sante').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "build/index.js"]
