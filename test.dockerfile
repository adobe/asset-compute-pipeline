FROM centos:8 AS builder

# Install dependencies
RUN yum -y install epel-release && \
  yum -y install dnf-plugins-core && yum config-manager --set-enabled powertools && \
  yum -y install wget curl file which diffutils git gcc gcc-c++ autoconf automake m4 make cmake tar bzip2 libtool libtool-ltdl libtool-ltdl-devel librsvg2-devel libarchive libarchive-devel librsvg2 librsvg2-tools fontconfig-devel libxml2 libxml2-devel pango-devel cairo-devel pkgconfig openssl openssl-devel mediainfo

# Install dependencies for additional tiff compression algorithms
# RUN yum -y install bzip2-devel xz-devel

WORKDIR /usr/local/imagemagick

# RUN git clone https://github.com/Kitware/CMake.git && \
#      cd CMake && git checkout v3.19.7 && \
#      ./bootstrap && make && make install

# Builds
# ====================================================================================================
# NASM
RUN curl -fsS https://www.nasm.us/pub/nasm/releasebuilds/2.15.05/nasm-2.15.05.tar.gz -o nasm-2.15.05.tar.gz
RUN [ "9182a118244b058651c576baa9d0366ee05983c4d4ae1d9ddd3236a9f2304997  nasm-2.15.05.tar.gz" = "$(sha256sum nasm-2.15.05.tar.gz)" ]
RUN echo "NASM =============================================================="
RUN tar -xf nasm-2.15.05.tar.gz
RUN cd nasm-2.15.05 && ./autogen.sh && ./configure && make -j6 && make install
RUN nasm --version

ENV PKG_CONFIG_PATH=/usr/local/lib/pkgconfig
ENV LD_LIBRARY_PATH="/usr/local/lib"

ENV CFLAGS="-march=core2 -s -O2 -ffunction-sections -fdata-sections -fmerge-all-constants -ffast-math -fgcse-after-reload -floop-interchange -floop-unroll-and-jam -fpeel-loops -fpeel-loops -fpredictive-commoning -fsplit-loops -fsplit-paths -ftree-loop-distribution -ftree-loop-vectorize -ftree-partial-pre -ftree-slp-vectorize -funswitch-loops -fuse-linker-plugin -pthread"
ENV CXXFLAGS="-march=core2 -s -O2 -ffunction-sections -fdata-sections -fmerge-all-constants -ffast-math -fgcse-after-reload -floop-interchange -floop-unroll-and-jam -fpeel-loops -fpeel-loops -fpredictive-commoning -fsplit-loops -fsplit-paths -ftree-loop-distribution -ftree-loop-vectorize -ftree-partial-pre -ftree-slp-vectorize -funswitch-loops -fuse-linker-plugin -pthread"
ENV CPPFLAGS="-march=core2 -s -O2 -ffunction-sections -fdata-sections -fmerge-all-constants -ffast-math -fgcse-after-reload -floop-interchange -floop-unroll-and-jam -fpeel-loops -fpeel-loops -fpredictive-commoning -fsplit-loops -fsplit-paths -ftree-loop-distribution -ftree-loop-vectorize -ftree-partial-pre -ftree-slp-vectorize -funswitch-loops -fuse-linker-plugin -pthread"

ENV LDFLAGS="-pthread -Wl,--gc-sections"


# Uses git archive to create a tar of the repo in order to verify checksum

# zlib 1.2.11
RUN git clone https://github.com/madler/zlib.git && \
  cd zlib && git checkout v1.2.11 && \
  git archive --format tar HEAD | cat > archive-zlib.tar && \
  [ "11aca2740fba7fc128a31cd607149cf29c3128e6038c1e9815baac345d337032  archive-zlib.tar" = "$(sha256sum archive-zlib.tar)" ] && \
  ./configure --64 && make -j6 && make install

# lz4 1.9.3 (fast compression algorithm supported by zstd)
RUN git clone https://github.com/lz4/lz4.git && \
  cd lz4 && git checkout v1.9.3 && \
  git archive --format tar HEAD | cat > archive-lz4.tar && \
  [ "f8d7eab547c87ddddcaa1f9a41fd90796397d27ecaa174fb0c047a68ba07e177  archive-lz4.tar" = "$(sha256sum archive-lz4.tar)" ] && \
  make -j6 && make install

# zstd 1.5.0 (additional tiff compression)
RUN git clone https://github.com/facebook/zstd.git && \
  cd zstd && git checkout v1.5.0 && \
  git archive --format tar HEAD | cat > archive-zstd.tar && \
  [ "f875449f6aae2c8cf199ff2631e4edc36e029340e1f65a416722e83ba24b8ee7  archive-zstd.tar" = "$(sha256sum archive-zstd.tar)" ] && \
  make -j6 && make install

# libpng 1.6.35
RUN git clone https://github.com/glennrp/libpng.git && \
  cd libpng && git checkout v1.6.35 && \
  git archive --format tar HEAD | cat > archive-libpng.tar && \
  [ "f91cf64b7a4e19d752e0b1670077d6486bcdf029074964589090ce0b75399443  archive-libpng.tar" = "$(sha256sum archive-libpng.tar)" ] && \
  ./configure LDFLAGS="-L/usr/local/lib -lz -Wl,--gc-sections" --enable-unversioned-links --enable-hardware-optimizations=yes --enable-intel-sse=yes --disable-static && \
  make -j6 && make install

# libjpeg-turbo, a faster libjpeg
RUN git clone https://github.com/libjpeg-turbo/libjpeg-turbo.git && \
  cd libjpeg-turbo && git checkout 2.1.1 && \
  git archive --format tar HEAD | cat > archive-libjpeg.tar && \
  [ "43893aa83c3cb0a0e8c6f8df86d9a6997f9c65d7d6a689fae6f2f0226a5529cd  archive-libjpeg.tar" = "$(sha256sum archive-libjpeg.tar)" ] && \
  cmake -G"Unix Makefiles" && make -j6 && make install
# Installed files into: /opt/libjpeg-turbo/lib64/, binaries into /opt/libjpeg-turbo/bin/, includes into /opt/libjpeg-turbo/include/turbojpeg.h
RUN cp -v -r /opt/libjpeg-turbo/lib64/libjpeg* /usr/local/lib/
RUN cp -v -r /opt/libjpeg-turbo/bin/* /usr/local/bin/
RUN cp -v -r /opt/libjpeg-turbo/include/* /usr/local/include/

# giflib 5.1.4
RUN git clone https://github.com/mirrorer/giflib.git && \
  cd giflib && git checkout fa37672085ce4b3d62c51627ab3c8cf2dda8009a && \
  git archive --format tar HEAD | cat > archive-giflib.tar && \
  [ "8c77c64eb217389e7b1b004c21b99d1bae1e5e1ee2f446c165a33aa511cff84b  archive-giflib.tar" = "$(sha256sum archive-giflib.tar)" ] && \
  ./autogen.sh && ./configure --disable-static && make -j6 && make install

# libwebp 1.2.1
RUN git clone https://github.com/webmproject/libwebp.git && \
  cd libwebp && git checkout v1.2.1 && \
  git archive --format tar HEAD | cat > archive-libwebp.tar && \
  [ "d6c87af84a4e28afd6ff9847ad92f2e6eab3d112d8dd6bbf633ffa67800d7840  archive-libwebp.tar" = "$(sha256sum archive-libwebp.tar)" ] && \
  ./autogen.sh && ./configure --disable-static --enable-libwebpmux --enable-libwebpdecoder --enable-libwebpextras && make -j6 && make install

# libdeflate 1.8 (faster decompression for tiff)
RUN git clone https://github.com/ebiggers/libdeflate.git && \
  cd libdeflate && git checkout v1.8 && \
  git archive --format tar HEAD | cat > archive-libdeflate.tar && \
  [ "c783e76e0ef1655a405a47680d9d47880eef70d14cb6b9f3fb32105a2fab87d1  archive-libdeflate.tar" = "$(sha256sum archive-libdeflate.tar)" ] && \
  make -j6 && make install

# libtiff 4.3.0
RUN git clone https://gitlab.com/libtiff/libtiff.git && \
  cd libtiff && git checkout v4.3.0 && \
  git archive --format tar HEAD | cat > archive-libtiff.tar && \
  [ "198a27255e28fe54570fd2808ca007f7aea8267bb37df92da9a794b73f6ce2ed  archive-libtiff.tar" = "$(sha256sum archive-libtiff.tar)" ] && \
  ./autogen.sh && \
  ./configure --enable-defer-strile-load --disable-static --enable-largefile \
  --with-jpeg-include-dir=/usr/local/include/ --with-jpeg-lib-dir=/usr/local/lib/ \
  --with-webp-include-dir=/usr/local/include/ --with-webp-lib-dir=/usr/local/lib/ \
  --with-zlib-include-dir=/usr/local/include/ --with-zlib-lib-dir=/usr/local/lib/ \
  --with-zstd-include-dir=/usr/local/include/ --with-zstd-lib-dir=/usr/local/lib/ \
  --with-libdeflate-include-dir=/usr/local/include/ --with-libdeflate-lib-dir=/usr/local/lib/ \
  && make -j6 && make install

# lcms2 2.12 (color handling)
RUN git clone https://github.com/mm2/Little-CMS.git && \
  cd Little-CMS && git checkout lcms2.12 && \
  git archive --format tar HEAD | cat > archive-Little-CMS.tar && \
  [ "88ce9d12c02d9fefccfcca659218f67f5fa34f8a7dae4fd48c5b27ce74f0fe10  archive-Little-CMS.tar" = "$(sha256sum archive-Little-CMS.tar)" ] && \
  ./configure --disable-static --with-jpeg=/usr/local/bin --with-tiff=/usr/local/bin && make -j6 && make install

# openjp2 2.4.0 JPEG200
RUN git clone https://github.com/uclouvain/openjpeg.git && \
  cd openjpeg && git checkout v2.4.0 && \
  git archive --format tar HEAD | cat > archive-openjpeg.tar && \
  [ "a8e31f5447b008fee764c820b8271afd39f88be8c97c9f9e082b65ede1a09db2  archive-openjpeg.tar" = "$(sha256sum archive-openjpeg.tar)" ] && \
  cmake -DCMAKE_BUILD_TYPE=Release && make -j6 && make install

# imagemagick 7.0.11
RUN git clone https://github.com/ImageMagick/ImageMagick.git && \
  cd ImageMagick && git checkout 7.0.11-6 && \
  git archive --format tar HEAD | cat > archive-ImageMagick.tar && \
  [ "ce7972b685313d792965320d86a069fbcb289a28c3bcd9c0c90d8f4364ee5c0a  archive-ImageMagick.tar" = "$(sha256sum archive-ImageMagick.tar)" ] && \
  ./configure -with-gcc-arch=core2 --enable-hdri=yes --enable-hugepages --enable-largefile --with-x=no --with-heic=no --with-magick-plus-plus=no --enable-static=no --disable-openmp --disable-opencl --disable-docs --without-perl --with-rsvg=yes --with-fontconfig=yes --with-xml=yes && \
  make -j6 && make install 

# Remove any static library, we don't want them
RUN cd /usr/local/lib/ && rm -f *.a






# nodejs14-action-centos
FROM centos:8

ARG NODE_VERSION

RUN yum -y install unzip libarchive file librsvg2 fontconfig && \
  yum -y install epel-release && \
  yum -y install perl-Image-ExifTool && \
  yum -y remove epel-release && \
  yum clean all && rm -rf /var/cache/* /var/lib/rpm/__db* /tmp/*

# dependencies
ENV UID=1001 \
  NOT_ROOT_USER=runtimeuser

# libraries
COPY --from=builder /usr/local/lib/ /usr/local/lib/
COPY --from=builder /etc/fonts /etc/fonts
COPY --from=builder /usr/lib64/librsvg* \
  /usr/lib64/liblcms2* \
  /usr/lib64/libfontconfig* \
  /usr/lib64/libfreetype* \
  /usr/lib64/libgdk_pixbuf* \
  /usr/lib64/libcairo* \
  /usr/lib64/libpangocairo*\
  /usr/lib64/libpango* \
  /usr/lib64/libcroco* \
  /usr/lib64/libpixman* \
  /usr/lib64/libEGL* \
  /usr/lib64/libxcb* \
  /usr/lib64/libXrender* \
  /usr/lib64/libX11* \
  /usr/lib64/libXext* \
  /usr/lib64/libGL* \
  /usr/lib64/libharfbuzz* \
  /usr/lib64/libthai* \
  /usr/lib64/libfribidi* \
  /usr/lib64/libXau* \
  /usr/lib64/libgraphite* \
  /usr/lib64/libxml2* \  
  /usr/lib64/libjpeg* \
  /usr/lib64/libpng* \ 
  /usr/lib64/libtiff* \      
  /usr/lib64/libwebp* \  
  /usr/lib64/libwzstd* \     
  /usr/lib64/

COPY nodejs14Action-centos/delegates.xml /usr/local/etc/ImageMagick-7/

# imagemagick
COPY --from=builder /usr/local/bin/convert /usr/local/bin/identify /usr/local/bin/composite /usr/local/bin/

# Verify imagemagick works
# ====================================================================================================
# Check Imagemagick commands are installed and working
# RUN convert -version && identify -version && composite -version

# Copy action runner
COPY nodejsActionBase /nodejsAction
# COPY the package.json to root container, so we can install npm packages a level up 
# from user's packages, so user's packages take precedence
COPY nodejs14Action/package.json /

# Install dependencies
# Clean-up rpm/yum cache database (reduce space)
# Install NodeJS 14.16.1
# Install Node modules available to all actions
# Remove system Node modules (e.g. npm)
# Add non-root user
# Establish permissions to the /nodejsAction directory
# Make the non-root user the owner of /nodejsAction since actions require
# Write access for downloading assets and generating renditions
RUN curl -Ss https://nodejs.org/dist/v14.16.1/node-v14.16.1-linux-x64.tar.gz | tar --strip-components 1 -xz -C /usr/local && \
  cd / && npm install --no-package-lock --production && npm cache clean --force && \
  rm -rf /usr/local/lib/node_modules && \
  find /nodejsAction -type f -exec chmod 644 "{}" ";" && \
  find /nodejsAction -type d -exec chmod 755 "{}" ";" && \
  adduser --user-group --uid ${UID} --home /home/${NOT_ROOT_USER} --shell /bin/bash ${NOT_ROOT_USER} && \
  chown ${NOT_ROOT_USER}:${NOT_ROOT_USER} /nodejsAction && \
  yum clean all && rm -rf /var/cache/* /var/lib/rpm/__db* /tmp/*
#RUN find / -type f -iname "*tar.gz" > location.txt && cat location.txt
#RUN cd /usr/lib64/ && ls -a -l > tmp0.txt && cat tmp0.txt
#RUN yum list installed > installed.txt && cat installed.txt

ENV NODE_ENV=production

USER ${NOT_ROOT_USER}
EXPOSE 8080
WORKDIR /nodejsAction

WORKDIR /nui
COPY . .
RUN npm ci
RUN npm test